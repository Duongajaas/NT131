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

const sessionStatusSchema = Joi.string()
	.valid('active', 'waiting_scan', 'approved_entry', 'parked', 'exit_pending', 'completed', 'blocked')
	.optional();

const entrySchema = Joi.object({
	uid: Joi.string().max(50).required(),
	plate_number: Joi.string().max(20).required(),
	plate_confidence: Joi.number().min(0).max(100).optional(),
	entry_image_url: Joi.string().uri().max(255).optional(),
	correlation_id: Joi.string().max(100).optional()
});

const verifyRfidSchema = Joi.object({
	uid: Joi.string().max(50).required(),
	observed_plate_number: Joi.string().max(20).required(),
	correlation_id: Joi.string().max(100).optional()
});

const sessionIdParamSchema = Joi.object({
	id: Joi.string().pattern(mongoObjectIdPattern).required().messages({
		'string.pattern.base': 'invalid session id'
	})
});

const listSessionsQuerySchema = Joi.object({
	status: sessionStatusSchema,
	rfid_card_id: Joi.string().pattern(mongoObjectIdPattern).optional(),
	vehicle_id: Joi.string().pattern(mongoObjectIdPattern).optional()
});

const approveSchema = Joi.object({
	correlation_id: Joi.string().max(100).optional()
});

const assignSlotSchema = Joi.object({
	slot_id: Joi.string().pattern(mongoObjectIdPattern).optional(),
	correlation_id: Joi.string().max(100).optional()
});

const exitSchema = Joi.object({
	exit_plate_number: Joi.string().max(20).required(),
	exit_plate_confidence: Joi.number().min(0).max(100).optional(),
	exit_image_url: Joi.string().uri().max(255).optional(),
	payment_status: Joi.string().valid('pending', 'paid', 'failed', 'waived').optional(),
	correlation_id: Joi.string().max(100).optional()
});

const createSlotSchema = Joi.object({
	slot_code: Joi.string().max(50).required(),
	level: Joi.number().integer().min(0).required(),
	slot_type: Joi.string().valid('regular', 'motorbike', 'handicap').optional()
});

const slotIdParamSchema = Joi.object({
	id: Joi.string().pattern(mongoObjectIdPattern).required().messages({
		'string.pattern.base': 'invalid slot id'
	})
});

const listSlotsQuerySchema = Joi.object({
	level: Joi.number().integer().min(0).optional(),
	slot_type: Joi.string().valid('regular', 'motorbike', 'handicap').optional(),
	is_occupied: Joi.boolean().optional()
});

export const createParkingEntryValidator = validateRequestPart('body', entrySchema);

export const verifyRfidValidator = validateRequestPart('body', verifyRfidSchema);

export const listParkingSessionsValidator = validateRequestPart('query', listSessionsQuerySchema);

export const approveParkingSessionValidator = [
	validateRequestPart('params', sessionIdParamSchema),
	validateRequestPart('body', approveSchema)
];

export const assignParkingSlotValidator = [
	validateRequestPart('params', sessionIdParamSchema),
	validateRequestPart('body', assignSlotSchema)
];

export const completeParkingExitValidator = [
	validateRequestPart('params', sessionIdParamSchema),
	validateRequestPart('body', exitSchema)
];

export const createParkingSlotValidator = validateRequestPart('body', createSlotSchema);

export const parkingSlotIdParamValidator = validateRequestPart('params', slotIdParamSchema);

export const listParkingSlotsValidator = validateRequestPart('query', listSlotsQuerySchema);
