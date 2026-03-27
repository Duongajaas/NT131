import express from 'express';
import * as residentController from '../controllers/resident.controller.ts';
import {
	authenticateToken,
	authorizeAdmin,
	authorizeAdminOrOperator
} from '../middlewares/auth/auth.middleware.ts';
import asyncHandler from '../middlewares/error-handling/async-handler.middleware.ts';
import {
	createResidentValidator,
	listResidentsValidator,
	residentIdParamValidator,
	updateResidentValidator
} from '../validators/resident.validators.ts';

const residentRouter = express.Router();

residentRouter.post(
	'/',
	authenticateToken,
	authorizeAdminOrOperator,
	createResidentValidator,
	asyncHandler(residentController.create)
);

residentRouter.get(
	'/',
	authenticateToken,
	authorizeAdminOrOperator,
	listResidentsValidator,
	asyncHandler(residentController.list)
);

residentRouter.get(
	'/:id',
	authenticateToken,
	authorizeAdminOrOperator,
	residentIdParamValidator,
	asyncHandler(residentController.getById)
);

residentRouter.patch(
	'/:id',
	authenticateToken,
	authorizeAdminOrOperator,
	updateResidentValidator,
	asyncHandler(residentController.update)
);

residentRouter.delete(
	'/:id',
	authenticateToken,
	authorizeAdmin,
	residentIdParamValidator,
	asyncHandler(residentController.remove)
);

export default residentRouter;