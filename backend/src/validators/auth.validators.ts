import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

export const registerValidator = [
	body('username')
		.isString()
		.isLength({ min: 3, max: 50 })
		.withMessage('username must be between 3 and 50 characters'),
	body('password')
		.isString()
		.isLength({ min: 6 })
		.withMessage('password must be at least 6 characters'),
	body('full_name')
		.optional()
		.isString()
		.isLength({ max: 100 })
		.withMessage('full_name must be at most 100 characters'),
	body('role')
		.optional()
		.isIn(['admin', 'operator'])
		.withMessage('role must be admin or operator')
];

export const loginValidator = [
	body('username').isString().notEmpty().withMessage('username is required'),
	body('password').isString().notEmpty().withMessage('password is required')
];

export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({
			message: 'Validation failed',
			errors: errors.array()
		});
	}

	next();
};
