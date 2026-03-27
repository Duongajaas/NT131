import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import AppError from '../../utills/app-error.ts';

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
		return res.status(error.statusCode).json({
			message: error.message,
			details: error.details
		});
	}

	if (error instanceof Error) {
		return res.status(500).json({
			message: 'Internal server error',
			error:
				process.env.NODE_ENV === 'development'
					? error.message
					: undefined
		});
	}

	return res.status(500).json({
		message: 'Internal server error'
	});
};

export default errorHandler;
