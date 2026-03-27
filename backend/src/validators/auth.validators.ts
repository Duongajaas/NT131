import type { NextFunction, Request, Response } from 'express';
import Joi, { type ObjectSchema } from 'joi';

const formatValidationErrors = (error: Joi.ValidationError) => {
	return error.details.map((detail) => ({
		field: detail.path.join('.'),
		message: detail.message
	}));
};

const validateBody = (schema: ObjectSchema) => {
	return (req: Request, res: Response, next: NextFunction) => {
		const { error, value } = schema.validate(req.body, {
			abortEarly: false,
			stripUnknown: true
		});

		if (error) {
			return res.status(400).json({
				message: 'Validation failed',
				errors: formatValidationErrors(error)
			});
		}

		req.body = value;
		next();
	};
};

const registerSchema = Joi.object({
	username: Joi.string().min(3).max(50).required(),
	password: Joi.string().min(6).required(),
	full_name: Joi.string().max(100).optional(),
	role: Joi.string().valid('admin', 'operator').optional()
});

const loginSchema = Joi.object({
	username: Joi.string().required(),
	password: Joi.string().required()
});

export const registerValidator = validateBody(registerSchema);
export const loginValidator = validateBody(loginSchema);
