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
		const source = part === 'query' ? req.query : req[part];
		const { error, value } = schema.validate(source, {
			abortEarly: false,
			stripUnknown: true
		});

		if (error) {
			return res.status(400).json({
				message: 'Validation failed',
				errors: formatValidationErrors(error)
			});
		}

		if (part === 'query') {
			res.locals.validatedQuery = value;
		} else {
			req[part] = value;
		}

		next();
	};
};

export default validateRequestPart;