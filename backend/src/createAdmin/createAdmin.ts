import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import checkConnection from '../config/database.ts';
import { createUser, findUserByUsername } from '../repositories/user.repository.ts';
import { hashPassword } from '../utills/password.ts';

dotenv.config();

export interface CreateAdminInput {
	username: string;
	password: string;
	full_name?: string;
}

const buildUserSummary = (user: {
	_id: unknown;
	username: string;
	full_name?: string;
	role: string;
	is_active: boolean;
}) => {
	return {
		id: user._id,
		username: user.username,
		full_name: user.full_name,
		role: user.role,
		is_active: user.is_active
	};
};

export const createAdmin = async (input: CreateAdminInput) => {
	const username = input.username.trim().toLowerCase();
	if (!username) {
		throw new Error('ADMIN_USERNAME is required');
	}

	if (!input.password.trim()) {
		throw new Error('ADMIN_PASSWORD is required');
	}

	const existingUser = await findUserByUsername(username);
	if (existingUser) {
		return {
			created: false,
			user: buildUserSummary(existingUser)
		};
	}

	const hashedPassword = await hashPassword(input.password);
	const user = await createUser({
		username,
		password: hashedPassword,
		full_name: input.full_name,
		role: 'admin'
	});

	return {
		created: true,
		user: buildUserSummary(user)
	};
};

const run = async () => {
	const username = process.env.ADMIN_USERNAME?.trim();
	const password = process.env.ADMIN_PASSWORD?.trim();
	const fullName = process.env.ADMIN_FULL_NAME?.trim();

	if (!username) {
		throw new Error('ADMIN_USERNAME is not defined in environment variables');
	}

	if (!password) {
		throw new Error('ADMIN_PASSWORD is not defined in environment variables');
	}

	await checkConnection();

	try {
		const result = await createAdmin({
			username,
			password,
			full_name: fullName || undefined
		});

		if (result.created) {
			console.log('✅ Admin account created successfully');
		} else {
			console.log('ℹ️ Admin account already exists');
		}

		console.log(result.user);
	} finally {
		await mongoose.disconnect();
	}
};

const isDirectExecution = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isDirectExecution) {
	run().catch((error) => {
		console.error('❌ Failed to create admin account:', error);
		process.exitCode = 1;
	});
}
