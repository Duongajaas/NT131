import express from 'express';
import * as authController from '../controllers/auth.controller.ts';
import {
	authenticateToken,
	authorizeAdmin
} from '../middlewares/auth/auth.middleware.ts';
import asyncHandler from '../middlewares/error-handling/async-handler.middleware.ts';
import {
	loginValidator,
	refreshTokenValidator,
	registerValidator
} from '../validators/auth.validators.ts';

const authRouter = express.Router();

authRouter.post(
	'/register',
	authenticateToken,
    authorizeAdmin,
	registerValidator,
	asyncHandler(authController.register)
);

authRouter.post(
	'/login',
	loginValidator,
	asyncHandler(authController.login)
);

authRouter.post(
	'/refresh-token',
	refreshTokenValidator,
	asyncHandler(authController.refreshToken)
);

export default authRouter;
