import * as dotenv from 'dotenv';
import express from 'express';
import checkConnection from './config/database.ts';
import errorHandler from './middlewares/error-handling/error-handler.middleware.ts';
import {
    authRateLimiter,
    apiRateLimiter
} from './middlewares/security/rate-limit.middleware.ts';
import apiRouter from './routes/index.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api/v1', apiRateLimiter);
app.use('/api/v1/auth', authRateLimiter);
app.use('/api/v1', apiRouter);
app.use(errorHandler);

const startServer = async () => {
    try {
        checkConnection();
        
        app.listen(PORT, () => {
          console.log(`Server is running on http://localhost:${PORT}/api/v1`);
        });      
    } catch (error) {
        console.error('❌ Failed to start server:', error);
    }
};

startServer();
