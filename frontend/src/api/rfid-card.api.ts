import { requestJson } from './http-client';
import type { ApiEnvelope, RfidCardRecord } from '../types/contracts';

interface AuthOptions {
	token: string;
}

export interface CreateRfidCardInput {
	uid: string;
	vehicle_id: string;
	card_type?: 'monthly' | 'guest';
	is_active?: boolean;
	monthly_fee?: number;
	monthly_started_at?: string;
	monthly_expires_at?: string;
}

export const listRfidCards = async (
	{ token }: AuthOptions,
	query?: { search?: string; card_type?: 'monthly' | 'guest'; is_active?: boolean }
) => {
	const params = new URLSearchParams();
	if (query?.search) {
		params.set('search', query.search);
	}
	if (query?.card_type) {
		params.set('card_type', query.card_type);
	}
	if (typeof query?.is_active === 'boolean') {
		params.set('is_active', String(query.is_active));
	}

	const suffix = params.toString() ? `?${params.toString()}` : '';
	const response = await requestJson<ApiEnvelope<RfidCardRecord[]>>(
		`/rfid-cards${suffix}`,
		{ token }
	);
	return response.data;
};

export const createRfidCard = async (
	input: CreateRfidCardInput,
	{ token }: AuthOptions
) => {
	const response = await requestJson<ApiEnvelope<RfidCardRecord>>('/rfid-cards', {
		method: 'POST',
		token,
		body: JSON.stringify(input)
	});
	return response.data;
};
