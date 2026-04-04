import express from 'express';
import * as vehicleController from '../controllers/vehicle.controller.ts';
import {
	authenticateToken,
	authorizeAdmin,
	authorizeAdminOrOperator
} from '../middlewares/auth/auth.middleware.ts';
import asyncHandler from '../middlewares/error-handling/async-handler.middleware.ts';
import {
	createVehicleValidator,
	listVehiclesValidator,
	updateVehicleValidator,
	vehicleIdParamValidator
} from '../validators/vehicle.validators.ts';

const vehicleRouter = express.Router();

vehicleRouter.post(
	'/',
	authenticateToken,
	authorizeAdminOrOperator,
	createVehicleValidator,
	asyncHandler(vehicleController.create)
);

vehicleRouter.get(
	'/',
	authenticateToken,
	authorizeAdminOrOperator,
	listVehiclesValidator,
	asyncHandler(vehicleController.list)
);

vehicleRouter.get(
	'/:id',
	authenticateToken,
	authorizeAdminOrOperator,
	vehicleIdParamValidator,
	asyncHandler(vehicleController.getById)
);

vehicleRouter.patch(
	'/:id',
	authenticateToken,
	authorizeAdminOrOperator,
	updateVehicleValidator,
	asyncHandler(vehicleController.update)
);

vehicleRouter.delete(
	'/:id',
	authenticateToken,
	authorizeAdmin,
	vehicleIdParamValidator,
	asyncHandler(vehicleController.remove)
);

export default vehicleRouter;