import express from 'express';
import * as rfidCardController from '../controllers/rfid-card.controller.ts';
import {
	authenticateToken,
	authorizeAdmin,
	authorizeAdminOrOperator
} from '../middlewares/auth/auth.middleware.ts';
import asyncHandler from '../middlewares/error-handling/async-handler.middleware.ts';
import {
	createRfidCardValidator,
	listRfidCardsValidator,
	rfidCardIdParamValidator,
	updateRfidCardValidator
} from '../validators/rfid-card.validators.ts';

const rfidCardRouter = express.Router();

rfidCardRouter.post(
	'/',
	authenticateToken,
	authorizeAdminOrOperator,
	createRfidCardValidator,
	asyncHandler(rfidCardController.create)
);

rfidCardRouter.get(
	'/',
	authenticateToken,
	authorizeAdminOrOperator,
	listRfidCardsValidator,
	asyncHandler(rfidCardController.list)
);

rfidCardRouter.get(
	'/:id',
	authenticateToken,
	authorizeAdminOrOperator,
	rfidCardIdParamValidator,
	asyncHandler(rfidCardController.getById)
);

rfidCardRouter.patch(
	'/:id',
	authenticateToken,
	authorizeAdminOrOperator,
	updateRfidCardValidator,
	asyncHandler(rfidCardController.update)
);

rfidCardRouter.delete(
	'/:id',
	authenticateToken,
	authorizeAdmin,
	rfidCardIdParamValidator,
	asyncHandler(rfidCardController.remove)
);

export default rfidCardRouter;