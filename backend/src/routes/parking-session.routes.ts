import express from 'express';
import * as parkingSessionController from '../controllers/parking-session.controller.ts';
import {
	authenticateToken,
	authorizeAdminOrOperator
} from '../middlewares/auth/auth.middleware.ts';
import asyncHandler from '../middlewares/error-handling/async-handler.middleware.ts';
import {
	approveParkingSessionValidator,
	assignParkingSlotValidator,
	completeParkingExitValidator,
	createParkingEntryValidator,
	listParkingSessionsValidator,
	verifyRfidValidator
} from '../validators/parking-session.validators.ts';

const parkingSessionRouter = express.Router();

parkingSessionRouter.post(
	'/rfid-verify',
	authenticateToken,
	authorizeAdminOrOperator,
	verifyRfidValidator,
	asyncHandler(parkingSessionController.verifyRfid)
);

parkingSessionRouter.post(
	'/entry',
	authenticateToken,
	authorizeAdminOrOperator,
	createParkingEntryValidator,
	asyncHandler(parkingSessionController.entry)
);

parkingSessionRouter.get(
	'/',
	authenticateToken,
	authorizeAdminOrOperator,
	listParkingSessionsValidator,
	asyncHandler(parkingSessionController.list)
);

parkingSessionRouter.post(
	'/:id/approve',
	authenticateToken,
	authorizeAdminOrOperator,
	approveParkingSessionValidator,
	asyncHandler(parkingSessionController.approve)
);

parkingSessionRouter.post(
	'/:id/assign-slot',
	authenticateToken,
	authorizeAdminOrOperator,
	assignParkingSlotValidator,
	asyncHandler(parkingSessionController.assignSlot)
);

parkingSessionRouter.post(
	'/:id/exit',
	authenticateToken,
	authorizeAdminOrOperator,
	completeParkingExitValidator,
	asyncHandler(parkingSessionController.exit)
);

export default parkingSessionRouter;
