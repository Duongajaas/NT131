import express from 'express';
import * as hardwareController from '../controllers/hardware.controller.ts';
import asyncHandler from '../middlewares/error-handling/async-handler.middleware.ts';

const hardwareRouter = express.Router();

hardwareRouter.get('/bootstrap', asyncHandler(hardwareController.bootstrap));

export default hardwareRouter;