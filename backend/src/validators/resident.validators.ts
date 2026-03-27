import type { NextFunction, Request, Response } from 'express';
import Joi, { type ObjectSchema } from 'joi';

const formatValidationErrors = (error: Joi.ValidationError) => {
	return error.details.map((detail) => ({
		field: detail.path.join('.'),
		message: detail.message
	}));
};

const validateRequestPart = (
	part: 'body' | 'params' | 'query',
	schema: ObjectSchema
) => {
	return (req: Request, res: Response, next: NextFunction) => {
		const { error, value } = schema.validate(req[part], {
			abortEarly: false,
			stripUnknown: true
		});

		if (error) {
			return res.status(400).json({
				message: 'Validation failed',
				errors: formatValidationErrors(error)
			});
		}

		req[part] = value;
		next();
	};
};

const mongoObjectIdPattern = /^[0-9a-fA-F]{24}$/;

const createResidentSchema = Joi.object({
	full_name: Joi.string().max(100).required(),
	phone: Joi.string().max(20).optional(),
	apartment_no: Joi.string().max(20).required(),
	is_active: Joi.boolean().optional()
});

const updateResidentSchema = Joi.object({
	full_name: Joi.string().max(100).optional(),
	phone: Joi.string().max(20).optional().allow(null),
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