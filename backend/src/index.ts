import * as dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'node:http';
import checkConnection from './config/database.ts';
import errorHandler from './middlewares/error-handling/error-handler.middleware.ts';
import {
    authRateLimiter,
    apiRateLimiter
} from './middlewares/security/rate-limit.middleware.ts';
import apiRouter from './routes/index.ts';
import {
	initializeSocketServer,
	shutdownSocketServer
} from './services/socket-io.service.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const httpServer = createServer(app);

app.use(express.json());

app.use('/api/v1', apiRateLimiter);
app.use('/api/v1/auth', authRateLimiter);
app.use('/api/v1', apiRouter);
app.use(errorHandler);

const startServer = async () => {
    try {
                await checkConnection();
                initializeSocketServer(httpServer);

                httpServer.listen(PORT, () => {
                    console.log(`Server is running on http://localhost:${PORT}/api/v1`);
                    console.log(`Socket.IO is running on ws://localhost:${PORT}/socket.io`);
                });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
    }
};

const shutdown = async (signal: string) => {
	console.log(`Received ${signal}. Shutting down...`);
	await shutdownSocketServer();
	httpServer.close(() => {
		console.log('HTTP server closed');
		process.exit(0);
	});
};

process.on('SIGINT', () => {
	void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
	void shutdown('SIGTERM');
});

startServer();
