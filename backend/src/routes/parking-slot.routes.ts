import express from 'express';
import * as parkingSlotController from '../controllers/parking-slot.controller.ts';
import {
	authenticateToken,
	authorizeAdmin,
	authorizeAdminOrOperator
} from '../middlewares/auth/auth.middleware.ts';
import asyncHandler from '../middlewares/error-handling/async-handler.middleware.ts';
import {
	createParkingSlotValidator,
	listParkingSlotsValidator,
	parkingSlotIdParamValidator
} from '../validators/parking-session.validators.ts';

const parkingSlotRouter = express.Router();

parkingSlotRouter.post(
	'/',
	authenticateToken,
	authorizeAdmin,
	createParkingSlotValidator,
	asyncHandler(parkingSlotController.create)
);

parkingSlotRouter.get(
	'/',
	authenticateToken,
	authorizeAdminOrOperator,
	listParkingSlotsValidator,
	asyncHandler(parkingSlotController.list)
);

parkingSlotRouter.get(
	'/:id',
	authenticateToken,
	authorizeAdminOrOperator,
	parkingSlotIdParamValidator,
	asyncHandler(parkingSlotController.getById)
);

parkingSlotRouter.patch(
	'/:id/release',
	authenticateToken,
	authorizeAdminOrOperator,
	parkingSlotIdParamValidator,
	asyncHandler(parkingSlotController.release)
);

export default parkingSlotRouter;
