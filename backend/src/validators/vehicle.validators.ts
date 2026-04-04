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

const createVehicleSchema = Joi.object({
	resident_id: Joi.string().pattern(mongoObjectIdPattern).optional(),
	vehicle_type: Joi.string().valid('motorbike', 'car').required(),
	plate_number: Joi.string().max(20).required()
});

const updateVehicleSchema = Joi.object({
	resident_id: Joi.string().pattern(mongoObjectIdPattern).optional().allow(null),
	vehicle_type: Joi.string().valid('motorbike', 'car').optional(),
	plate_number: Joi.string().max(20).optional()
}).or('resident_id', 'vehicle_type', 'plate_number');

const vehicleIdParamSchema = Joi.object({
	id: Joi.string().pattern(mongoObjectIdPattern).required().messages({
		'string.pattern.base': 'invalid vehicle id'
	})
});

const listVehiclesQuerySchema = Joi.object({
	search: Joi.string().max(100).optional(),
	vehicle_type: Joi.string().valid('motorbike', 'car').optional(),
	resident_id: Joi.string().pattern(mongoObjectIdPattern).optional()
});

export const createVehicleValidator = validateRequestPart('body', createVehicleSchema);

export const updateVehicleValidator = [
	validateRequestPart('params', vehicleIdParamSchema),
	validateRequestPart('body', updateVehicleSchema)
];

export const vehicleIdParamValidator = validateRequestPart('params', vehicleIdParamSchema);

export const listVehiclesValidator = validateRequestPart('query', listVehiclesQuerySchema);