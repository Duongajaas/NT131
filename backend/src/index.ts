import * as dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import checkConnection from './config/database.ts';
import errorHandler from './middlewares/error-handling/error-handler.middleware.ts';
import requestLogger from './middlewares/logging/request-logger.middleware.ts';
import {
    authRateLimiter,
    apiRateLimiter
} from './middlewares/security/rate-limit.middleware.ts';
import apiRouter from './routes/index.ts';
import {
	initializeSocketServer,
	shutdownSocketServer
} from './services/socket-io.service.ts';
import logger from './utills/logger.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const httpServer = createServer(app);
const allowedCorsOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://192.168.1.5'];

const listenForServer = (server: typeof httpServer, port: string | number) => {
	return new Promise<void>((resolve, reject) => {
		const onError = (error: Error) => {
			server.off('listening', onListening);
			reject(error);
		};

		const onListening = () => {
			server.off('error', onError);
			resolve();
		};

		server.once('error', onError);
		server.once('listening', onListening);
		server.listen(port);
	});
};

app.use(express.json());

app.use(cors({ origin: allowedCorsOrigins }));
app.use(requestLogger);

app.use('/api/v1', apiRateLimiter);
app.use('/api/v1/auth', authRateLimiter);
app.use('/api/v1', apiRouter);
app.use(errorHandler);

const startServer = async () => {
	await checkConnection();
	initializeSocketServer(httpServer);
	await listenForServer(httpServer, PORT);
	logger.info('Backend server started', {
		apiBaseUrl: `http://localhost:${PORT}/api/v1`,
		socketPath: `http://localhost:${PORT}/socket.io`,
		corsOrigins: allowedCorsOrigins
	});
};

const shutdown = async (signal: string) => {
	logger.info('Shutdown signal received', { signal });
	await shutdownSocketServer();
	await mongoose.disconnect();
	logger.info('Backend shutdown complete', { signal });
};

const handleShutdownSignal = (signal: NodeJS.Signals) => {
	void shutdown(signal)
		.then(() => {
			process.exit(0);
		})
		.catch((error) => {
			logger.error('Failed during shutdown', { signal, error });
			process.exit(1);
		});
};

process.once('SIGINT', () => {
	handleShutdownSignal('SIGINT');
});

process.once('SIGTERM', () => {
	handleShutdownSignal('SIGTERM');
});

process.once('SIGUSR2', () => {
	handleShutdownSignal('SIGUSR2');
});

void startServer().catch(async (error) => {
	logger.error('Failed to start backend server', { error });
	await shutdownSocketServer();
	await mongoose.disconnect();
	process.exit(1);
});
