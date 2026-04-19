import Joi from 'joi';
import validateRequestPart from './request-part.validator.ts';

const mongoObjectIdPattern = /^[0-9a-fA-F]{24}$/;

const pricingPolicyIdParamSchema = Joi.object({
	id: Joi.string().pattern(mongoObjectIdPattern).required().messages({
		'string.pattern.base': 'invalid pricing policy id'
	})
});

const createPricingPolicySchema = Joi.object({
	vehicle_type: Joi.string().valid('motorbike', 'car').required(),
	card_type: Joi.string().valid('monthly', 'guest').optional(),
	price_per_hour: Joi.number().min(0).required(),
	free_minutes: Joi.number().integer().min(0).optional(),
	is_active: Joi.boolean().optional(),
	effective_from: Joi.date().optional()
});

const updatePricingPolicySchema = Joi.object({
	vehicle_type: Joi.string().valid('motorbike', 'car').optional(),
	card_type: Joi.string().valid('monthly', 'guest').optional(),
	price_per_hour: Joi.number().min(0).optional(),
	free_minutes: Joi.number().integer().min(0).optional(),
	is_active: Joi.boolean().optional(),
	effective_from: Joi.date().optional()
	})
	.or('vehicle_type', 'card_type', 'price_per_hour', 'free_minutes', 'is_active', 'effective_from');

const listPricingPoliciesQuerySchema = Joi.object({
	vehicle_type: Joi.string().valid('motorbike', 'car').optional(),
	card_type: Joi.string().valid('monthly', 'guest').optional(),
	is_active: Joi.string().valid('true', 'false').optional()
});

export const createPricingPolicyValidator = validateRequestPart('body', createPricingPolicySchema);

export const updatePricingPolicyValidator = [
	validateRequestPart('params', pricingPolicyIdParamSchema),
	validateRequestPart('body', updatePricingPolicySchema)
];

export const pricingPolicyIdParamValidator = validateRequestPart('params', pricingPolicyIdParamSchema);

export const listPricingPoliciesValidator = validateRequestPart('query', listPricingPoliciesQuerySchema);