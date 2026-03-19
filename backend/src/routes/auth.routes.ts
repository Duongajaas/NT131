import express from 'express';
import * as authController from '../controllers/auth.controller.ts';
import {
	authenticateToken,
	authorizeAdmin,
	authorizeAdminOrOperator
} from '../middlewares/auth/auth.middleware.ts';
import asyncHandler from '../middlewares/error-handling/async-handler.middleware.ts';
import {
	loginValidator,
	registerValidator,
	validateRequest
} from '../validators/auth.validators.ts';

const authRouter = express.Router();

authRouter.post(
	'/register',
    authorizeAdmin,
	registerValidator,
	validateRequest,
	asyncHandler(authController.register)
);

authRouter.post(
	'/login',
	loginValidator,
	validateRequest,
	asyncHandler(authController.login)
);

export default authRouter;
