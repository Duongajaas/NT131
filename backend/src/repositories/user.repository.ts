import User from '../models/user.models.ts';
import type { IUser, UserRole } from '../models/user.models.ts';

export interface CreateUserInput {
	username: string;
	password: string;
	full_name?: string;
	role?: UserRole;
}

export const findUserByUsername = async (username: string): Promise<IUser | null> => {
	return User.findOne({ username });
};

export const findUserById = async (userId: string): Promise<IUser | null> => {
	return User.findById(userId);
};

export const createUser = async (input: CreateUserInput): Promise<IUser> => {
	return User.create({
		username: input.username,
		password: input.password,
		full_name: input.full_name,
		role: input.role || 'operator'
	});
};
