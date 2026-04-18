import express from 'express';
import * as parkingStatusController from '../controllers/parking-status.controller.ts';
import {
	authenticateToken,
	authorizeAdminOrOperator
} from '../middlewares/auth/auth.middleware.ts';
import asyncHandler from '../middlewares/error-handling/async-handler.middleware.ts';
import { listParkingSlotsValidator } from '../validators/parking-session.validators.ts';

const parkingStatusRouter = express.Router();

parkingStatusRouter.get(
	'/overview',
	authenticateToken,
	authorizeAdminOrOperator,
	asyncHandler(parkingStatusController.overview)
);

parkingStatusRouter.get(
	'/slots',
	authenticateToken,
	authorizeAdminOrOperator,
	listParkingSlotsValidator,
	asyncHandler(parkingStatusController.slots)
);

parkingStatusRouter.get(
	'/gates',
	authenticateToken,
	authorizeAdminOrOperator,
	asyncHandler(parkingStatusController.gates)
);

parkingStatusRouter.get(
	'/gate-commands',
	authenticateToken,
	authorizeAdminOrOperator,
	asyncHandler(parkingStatusController.gateCommands)
);

parkingStatusRouter.get(
	'/revenue-report',
	authenticateToken,
	authorizeAdminOrOperator,
	asyncHandler(parkingStatusController.revenueReport)
);

export default parkingStatusRouter;
