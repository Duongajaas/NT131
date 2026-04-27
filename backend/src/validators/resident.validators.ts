import Joi, { type ObjectSchema } from 'joi';
import validateRequestPart from './request-part.validator.ts';

const mongoObjectIdPattern = /^[0-9a-fA-F]{24}$/;

const createResidentSchema = Joi.object({
	full_name: Joi.string().max(100).required(),
	phone: Joi.string().max(10).optional(),
	apartment_no: Joi.string().max(20).required(),
	is_active: Joi.boolean().optional()
});

const updateResidentSchema = Joi.object({
	full_name: Joi.string().max(100).optional(),
	phone: Joi.string().max(10).optional().allow(null),
	apartment_no: Joi.string().max(20).optional(),
	is_active: Joi.boolean().optional()
}).or('full_name', 'phone', 'apartment_no', 'is_active');

const residentIdParamSchema = Joi.object({
	id: Joi.string().pattern(mongoObjectIdPattern).required().messages({
		'string.pattern.base': 'invalid resident id'
	})
});

const listResidentsQuerySchema = Joi.object({
	search: Joi.string().max(100).optional(),
	is_active: Joi.string().valid('true', 'false').optional()
});

export const createResidentValidator = validateRequestPart(
	'body',
	createResidentSchema
);

export const updateResidentValidator = [
	validateRequestPart('params', residentIdParamSchema),
	validateRequestPart('body', updateResidentSchema)
];

export const residentIdParamValidator = validateRequestPart(
	'params',
	residentIdParamSchema
);

export const listResidentsValidator = validateRequestPart(
	'query',
	listResidentsQuerySchema
);