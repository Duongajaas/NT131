import express from 'express';
import * as pricingPolicyController from '../controllers/pricing-policy.controller.ts';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth/auth.middleware.ts';
import asyncHandler from '../middlewares/error-handling/async-handler.middleware.ts';
import {
	createPricingPolicyValidator,
	listPricingPoliciesValidator
} from '../validators/pricing-policy.validators.ts';

const pricingPolicyRouter = express.Router();

pricingPolicyRouter.get(
	'/',
	authenticateToken,
	authorizeAdmin,
	listPricingPoliciesValidator,
	asyncHandler(pricingPolicyController.list)
);

pricingPolicyRouter.post(
	'/',
	authenticateToken,
	authorizeAdmin,
	createPricingPolicyValidator,
	asyncHandler(pricingPolicyController.create)
);

export default pricingPolicyRouter;