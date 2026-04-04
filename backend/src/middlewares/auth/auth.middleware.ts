import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../../models/user.models.ts';
import type { JwtPayload } from '../../utills/password.ts';
import { findUserById } from '../../repositories/user.repository.ts';
import AppError from '../../utills/app-error.ts';
import { verifyToken } from '../../utills/password.ts';

const getTokenFromHeader = (authHeader?: string): string | null => {
	if (!authHeader) {
		return null;
	}

	const [scheme, token] = authHeader.split(' ');
	if (scheme !== 'Bearer' || !token) {
		return null;
	}

	return token;
};

export const authenticateToken = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const token = getTokenFromHeader(req.headers.authorization);

	if (!token) {
		throw new AppError('Access token is required', 401);
	}

	let decoded: JwtPayload;
	try {
		decoded = verifyToken(token) as JwtPayload;
	} catch {
		throw new AppError('Invalid or expired access token', 401);
	}

	const user = await findUserById(decoded.userId);
	if (!user) {
		throw new AppError('User not found', 401);
	}

	if (!user.is_active) {
		throw new AppError('User is inactive', 403);
	}

	req.user = {
		userId: user._id.toString(),
		username: user.username,
		role: user.role
	};

	next();
};

export const authorizeRoles = (...allowedRoles: UserRole[]) => {
	return (req: Request, res: Response, next: NextFunction) => {
		if (!req.user) {
			throw new AppError('Unauthorized', 401);
		}

		if (!allowedRoles.includes(req.user.role)) {
			throw new AppError('Forbidden: insufficient permissions', 403);
		}

		next();
	};
};

export const authorizeAdmin = authorizeRoles('admin');
export const authorizeOperator = authorizeRoles('operator');
export const authorizeAdminOrOperator = authorizeRoles('admin', 'operator');
