import { requestJson } from './http-client';
import type { ApiEnvelope, ResidentRecord } from '../types/contracts';

interface AuthOptions {
	token: string;
}

export interface CreateResidentInput {
	full_name: string;
	phone?: string;
	apartment_no: string;
	is_active?: boolean;
}

export const listResidents = async ({ token }: AuthOptions, search?: string) => {
	const params = new URLSearchParams();
	if (search) {
		params.set('search', search);
	}

	const suffix = params.toString() ? `?${params.toString()}` : '';
	const response = await requestJson<ApiEnvelope<ResidentRecord[]>>(`/residents${suffix}`, {
		token
	});
	return response.data;
};

export const getResidentById = async (residentId: string, { token }: AuthOptions) => {
	const response = await requestJson<ApiEnvelope<ResidentRecord>>(`/residents/${residentId}`, {
		token
	});
	return response.data;
};

export const createResident = async (
	input: CreateResidentInput,
	{ token }: AuthOptions
) => {
	const response = await requestJson<ApiEnvelope<ResidentRecord>>('/residents', {
		method: 'POST',
		token,
		body: JSON.stringify(input)
	});
	return response.data;
};
