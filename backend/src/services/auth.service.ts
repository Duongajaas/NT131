import type { IUser, UserRole } from '../models/user.models.ts';
import { createUser, findUserById, findUserByUsername } from '../repositories/user.repository.ts';
import AppError from '../utills/app-error.ts';
import {
	comparePassword,
	generateRefreshToken,
	generateToken,
	hashPassword,
	verifyRefreshToken
} from '../utills/password.ts';

interface RegisterInput {
	username: string;
	password: string;
	full_name?: string;
	role?: UserRole;
}

interface LoginInput {
	username: string;
	password: string;
}

interface RefreshTokenInput {
	refreshToken: string;
}

// Xây dựng phản hồi sau khi đăng nhập hoặc đăng ký thành công
const buildAuthResponse = (user: IUser) => {
	const payload = {
		userId: user._id.toString(),
		username: user.username,
		role: user.role
	};

	const token = generateToken(payload);
	const refreshToken = generateRefreshToken(payload);

	return {
		user: {
			id: user._id,
			username: user.username,
			full_name: user.full_name,
			role: user.role,
			is_active: user.is_active
		},
		token,
		refreshToken
	};
};

// Hàm đăng ký người dùng mới (chỉ admin mới có quyền tạo tài khoản)
export const register = async (input: RegisterInput) => {
	const existingUser = await findUserByUsername(input.username);
	if (existingUser) {
		throw new AppError('Username already exists', 409);
	}

	const hashedPassword = await hashPassword(input.password);

	const user = await createUser({
		username: input.username,
		password: hashedPassword,
		full_name: input.full_name,
		role: input.role || 'operator'
	});

	return buildAuthResponse(user);
};

// Hàm đăng nhập người dùng
export const login = async (input: LoginInput) => {
	const user = await findUserByUsername(input.username);

	if (!user) {
		throw new AppError('Invalid username or password', 401);
	}

	if (!user.is_active) {
		throw new AppError('User is inactive', 403);
	}

	const isPasswordValid = await comparePassword(input.password, user.password);

	if (!isPasswordValid) {
		throw new AppError('Invalid username or password', 401);
	}

	return buildAuthResponse(user);
};

export const refreshToken = async (input: RefreshTokenInput) => {
	let decoded: { userId?: string };
	try {
		decoded = verifyRefreshToken(input.refreshToken) as { userId?: string };
	} catch {
		throw new AppError('Invalid refresh token', 401);
	}

	if (!decoded.userId) {
		throw new AppError('Invalid refresh token', 401);
	}

	const user = await findUserById(decoded.userId);
	if (!user) {
		throw new AppError('User not found', 404);
	}

	if (!user.is_active) {
		throw new AppError('User is inactive', 403);
	}

	return buildAuthResponse(user);
};
