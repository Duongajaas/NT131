import type { NextFunction, Request, Response } from 'express';
import logger from '../../utills/logger.ts';

const buildUserContext = (req: Request) => {
	if (!req.user) {
		return undefined;
	}

	return {
		userId: req.user.userId,
		username: req.user.username,
		role: req.user.role
	};
};

const requestLogger = (req: Request, res: Response, next: NextFunction) => {
	const startedAt = process.hrtime.bigint();

	res.on('finish', () => {
		if (res.statusCode >= 400) {
			return;
		}

		const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
		logger.info('HTTP request completed', {
			method: req.method,
			path: req.originalUrl,
			statusCode: res.statusCode,
			durationMs: Number(durationMs.toFixed(1)),
			user: buildUserContext(req)
		});
	});

	next();
};

export default requestLogger;