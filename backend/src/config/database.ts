import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import logger from '../utills/logger.ts';

dotenv.config();

async function checkConnection() {
    try {
    const conn = await mongoose.connect(process.env.MONGODB_URI as string);
    logger.info('MongoDB connected', {
					database: conn.connection.name,
					host: conn.connection.host
				});
    return conn;
  } catch (err) {
    logger.error('MongoDB connection failed', { error: err });
    throw err;
  }
}

export default checkConnection;