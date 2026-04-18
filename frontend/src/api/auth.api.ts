import { requestJson } from './http-client';
import type { ApiEnvelope, AuthPayload } from '../types/contracts';

export interface LoginInput {
	username: string;
	password: string;
}

interface AuthOptions {
	token: string;
}

export interface RegisterUserInput {
	username: string;
	password: string;
	full_name?: string;
	role?: 'admin' | 'operator';
}

export const login = async (input: LoginInput) => {
	const response = await requestJson<ApiEnvelope<AuthPayload>>('/auth/login', {
		method: 'POST',
		body: JSON.stringify(input)
	});
	return response.data;
};

export const registerUser = async (
	input: RegisterUserInput,
	{ token }: AuthOptions
) => {
	const response = await requestJson<ApiEnvelope<AuthPayload>>('/auth/register', {
		method: 'POST',
		token,
		body: JSON.stringify(input)
	});
	return response.data;
};
