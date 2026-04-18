import type { NextFunction, Request, Response } from 'express';
import AppError from '../../utills/app-error.ts';
import logger from '../../utills/logger.ts';

const buildRequestContext = (req: Request) => ({
	method: req.method,
	path: req.originalUrl,
	user: req.user
});

const errorHandler = (
	error: unknown,
	req: Request,
	res: Response,
	next: NextFunction
) => {
	if (res.headersSent) {
		return next(error);
	}

	if (error instanceof AppError) {
		logger.warn('Request rejected', {
			...buildRequestContext(req),
			statusCode: error.statusCode,
			message: error.message,
			details: error.details
		});

		return res.status(error.statusCode).json({
			message: error.message,
			details: error.details
		});
	}

	if (error instanceof Error) {
		logger.error('Unhandled request error', {
			...buildRequestContext(req),
			error
		});

		return res.status(500).json({
			message: 'Internal server error',
			error:
				process.env.NODE_ENV === 'development'
					? error.message
					: undefined
		});
	}

	logger.error('Unhandled non-error thrown', {
		...buildRequestContext(req),
		error
	});

	return res.status(500).json({
		message: 'Internal server error'
	});
};

export default errorHandler;
