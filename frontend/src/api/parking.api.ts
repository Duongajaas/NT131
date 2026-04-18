import { requestJson } from './http-client';
import type {
	ApiEnvelope,
	OverviewData,
	ParkingSlotRecord,
	RevenueReport,
	SessionSummary
} from '../types/contracts';

interface AuthOptions {
	token: string;
}

interface CorrelationOptions {
	correlation_id?: string;
}

export interface CreateParkingSlotInput {
	slot_code: string;
	level: number;
	slot_type?: ParkingSlotRecord['slot_type'];
}

export interface VerifyRfidResult {
	uid: string;
	observed_plate_number: string;
	expected_plate_number: string | null;
	is_match: boolean;
	decision: 'accepted' | 'rejected';
	reason?: string;
	rfid_card_found: boolean;
	rfid_card_active: boolean;
	rfid_card_id: string | null;
	vehicle_id: string | null;
}

export const listParkingSessions = async ({ token }: AuthOptions) => {
	const response = await requestJson<ApiEnvelope<SessionSummary[]>>('/parking/sessions', {
		token
	});
	return response.data;
};

export const listParkingSlots = async (
	{ token }: AuthOptions,
	query?: { is_occupied?: boolean; level?: number; slot_type?: 'regular' | 'motorbike' | 'handicap' }
) => {
	const params = new URLSearchParams();
	if (typeof query?.is_occupied === 'boolean') {
		params.set('is_occupied', String(query.is_occupied));
	}
	if (typeof query?.level === 'number') {
		params.set('level', String(query.level));
	}
	if (query?.slot_type) {
		params.set('slot_type', query.slot_type);
	}

	const suffix = params.toString() ? `?${params.toString()}` : '';

	const response = await requestJson<ApiEnvelope<ParkingSlotRecord[]>>(`/parking/slots${suffix}`, {
		token
	});

	return response.data;
};

export const createParkingSlot = async (
	input: CreateParkingSlotInput,
	{ token }: AuthOptions
) => {
	const response = await requestJson<ApiEnvelope<ParkingSlotRecord>>('/parking/slots', {
		method: 'POST',
		token,
		body: JSON.stringify(input)
	});

	return response.data;
};

export const getParkingOverview = async ({ token }: AuthOptions) => {
	const response = await requestJson<ApiEnvelope<OverviewData>>('/parking/status/overview', {
		token
	});
	return response.data;
};

export const verifyRfidPlate = async (
	input: {
		uid: string;
		observed_plate_number: string;
	} & CorrelationOptions,
	{ token }: AuthOptions
) => {
	const response = await requestJson<ApiEnvelope<VerifyRfidResult>>('/parking/sessions/rfid-verify', {
		method: 'POST',
		token,
		body: JSON.stringify(input)
	});
	return response.data;
};

export const createParkingEntry = async (
	input: {
		uid: string;
		plate_number: string;
		plate_confidence?: number;
		entry_image_url?: string;
	} & CorrelationOptions,
	{ token }: AuthOptions
) => {
	const response = await requestJson<
		ApiEnvelope<{ session: SessionSummary; gate_action: 'open' | 'deny'; reason?: string }>
	>('/parking/sessions/entry', {
		method: 'POST',
		token,
		body: JSON.stringify(input)
	});
	return response.data;
};

export const approveBlockedSession = async (
	sessionId: string,
	input: CorrelationOptions,
	{ token }: AuthOptions
) => {
	const response = await requestJson<ApiEnvelope<SessionSummary>>(
		`/parking/sessions/${sessionId}/approve`,
		{
			method: 'POST',
			token,
			body: JSON.stringify(input)
		}
	);
	return response.data;
};

export const assignParkingSlot = async (
	sessionId: string,
	input: {
		slot_id?: string;
	} & CorrelationOptions,
	{ token }: AuthOptions
) => {
	const response = await requestJson<
		ApiEnvelope<{ session: SessionSummary; slot: { _id: string; slot_code: string } }>
	>(`/parking/sessions/${sessionId}/assign-slot`, {
		method: 'POST',
		token,
		body: JSON.stringify(input)
	});
	return response.data;
};

export const completeParkingExit = async (
	sessionId: string,
	input: {
		exit_plate_number: string;
		payment_status: 'pending' | 'paid' | 'failed' | 'waived';
	} & CorrelationOptions,
	{ token }: AuthOptions
) => {
	const response = await requestJson<
		ApiEnvelope<{
			session: SessionSummary;
			transaction: {
				final_amount: number;
				payment_status: string;
				amount: number;
			};
			gate_action: 'open' | 'deny';
		}>
	>(`/parking/sessions/${sessionId}/exit`, {
		method: 'POST',
		token,
		body: JSON.stringify(input)
	});
	return response.data;
};

export const getRevenueReport = async (
	{ token }: AuthOptions,
	query?: { from_date?: string; to_date?: string; limit?: number }
) => {
	const params = new URLSearchParams();
	if (query?.from_date) {
		params.set('from_date', query.from_date);
	}
	if (query?.to_date) {
		params.set('to_date', query.to_date);
	}
	if (typeof query?.limit === 'number') {
		params.set('limit', String(query.limit));
	}

	const suffix = params.toString() ? `?${params.toString()}` : '';
	const response = await requestJson<ApiEnvelope<RevenueReport>>(
		`/parking/status/revenue-report${suffix}`,
		{ token }
	);
	return response.data;
};
