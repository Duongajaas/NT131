import rateLimit from 'express-rate-limit';

const ONE_MINUTE_IN_MS = 60 * 1000;
const FIFTEEN_MINUTES_IN_MS = 15 * ONE_MINUTE_IN_MS;

export const apiRateLimiter = rateLimit({
	windowMs: FIFTEEN_MINUTES_IN_MS,
	max: 300,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		message: 'Too many requests, please try again later.'
	}
});

export const authRateLimiter = rateLimit({
	windowMs: ONE_MINUTE_IN_MS,
	max: 20,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		message: 'Too many authentication requests, please try again shortly.'
	}
});