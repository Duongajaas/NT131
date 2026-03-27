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

const monthlyDateOrderValidation = (
	value: {
		monthly_started_at?: string | Date | null;
		monthly_expires_at?: string | Date | null;
	},
	helper: Joi.CustomHelpers
) => {
	if (
		value.monthly_started_at &&
		value.monthly_expires_at &&
		new Date(value.monthly_expires_at) <= new Date(value.monthly_started_at)
	) {
		return helper.error('any.invalid', {
			message: 'monthly_expires_at must be greater than monthly_started_at'
		});
	}

	return value;
};

const createRfidCardSchema = Joi.object({
	uid: Joi.string().max(50).required(),
	vehicle_id: Joi.string().pattern(mongoObjectIdPattern).required(),
	card_type: Joi.string().valid('monthly', 'guest').optional(),
	is_active: Joi.boolean().optional(),
	monthly_fee: Joi.number().min(0).optional(),
	monthly_started_at: Joi.date().optional(),
	monthly_expires_at: Joi.date().optional()
})
	.custom(monthlyDateOrderValidation)
	.when(Joi.object({ card_type: Joi.valid('monthly') }).unknown(), {
		then: Joi.object({
			monthly_fee: Joi.number().min(0).required(),
			monthly_started_at: Joi.date().required(),
			monthly_expires_at: Joi.date().required()
		})
	});

const updateRfidCardSchema = Joi.object({
	uid: Joi.string().max(50).optional(),
	vehicle_id: Joi.string().pattern(mongoObjectIdPattern).optional(),
	card_type: Joi.string().valid('monthly', 'guest').optional(),
	is_active: Joi.boolean().optional(),
	monthly_fee: Joi.number().min(0).optional().allow(null),
	monthly_started_at: Joi.date().optional().allow(null),
	monthly_expires_at: Joi.date().optional().allow(null)
})
	.or(
		'uid',
		'vehicle_id',
		'card_type',
		'is_active',
		'monthly_fee',
		'monthly_started_at',
		'monthly_expires_at'
	)
	.custom(monthlyDateOrderValidation)
	.when(Joi.object({ card_type: Joi.valid('monthly') }).unknown(), {
		then: Joi.object({
			monthly_fee: Joi.number().min(0).required(),
			monthly_started_at: Joi.date().required(),
			monthly_expires_at: Joi.date().required()
		})
	});

const rfidCardIdParamSchema = Joi.object({
	id: Joi.string().pattern(mongoObjectIdPattern).required().messages({
		'string.pattern.base': 'invalid rfid card id'
	})
});

const listRfidCardsQuerySchema = Joi.object({
	search: Joi.string().max(100).optional(),
	card_type: Joi.string().valid('monthly', 'guest').optional(),
	is_active: Joi.string().valid('true', 'false').optional(),
	vehicle_id: Joi.string().pattern(mongoObjectIdPattern).optional()
});

export const createRfidCardValidator = validateRequestPart(
	'body',
	createRfidCardSchema
);

export const updateRfidCardValidator = [
	validateRequestPart('params', rfidCardIdParamSchema),
	validateRequestPart('body', updateRfidCardSchema)
];

export const rfidCardIdParamValidator = validateRequestPart(
	'params',
	rfidCardIdParamSchema
);

export const listRfidCardsValidator = validateRequestPart(
	'query',
	listRfidCardsQuerySchema
);