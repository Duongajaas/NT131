import axios, { AxiosHeaders, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import type {
	ApiEnvelope,
	ParkingSlotRecord,
	RfidCardRecord,
	SessionSummary,
	VehicleRecord
} from '../types/contracts';

const API_BASE_URL =
	import.meta.env.VITE_API_BASE_URL?.trim() || import.meta.env.VITE_API_URL?.trim() || 'http://localhost:5000/api/v1';

const SIMULATOR_API_KEY =
	import.meta.env.VITE_SIMULATOR_API_KEY?.trim() ||
	import.meta.env.VITE_SIMULATOR_API_TOKEN?.trim() ||
	'';

interface RequestOptions extends RequestInit {
	token?: string;
	apiKey?: string;
}

export class ApiError extends Error {
	status: number;
	data?: unknown;

	constructor(message: string, status: number, data?: unknown) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.data = data;
	}
}

const apiClient = axios.create({
	baseURL: API_BASE_URL,
	timeout: 15000,
	headers: {
		'Content-Type': 'application/json'
	}
});

apiClient.interceptors.request.use(
	(config) => {
		const requestConfig = config as InternalAxiosRequestConfig & {
			token?: string;
			apiKey?: string;
		};
		const headers = AxiosHeaders.from(requestConfig.headers);

		if (!headers.has('Content-Type')) {
			headers.set('Content-Type', 'application/json');
		}

		if (requestConfig.token && !headers.has('Authorization')) {
			headers.set('Authorization', `Bearer ${requestConfig.token}`);
		}

		if (requestConfig.apiKey && !headers.has('x-simulator-api-key')) {
			headers.set('x-simulator-api-key', requestConfig.apiKey);
		}

		requestConfig.headers = headers;
		return requestConfig;
	},
	(error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
	(response) => response,
	(error) => Promise.reject(error)
);

const getErrorMessage = (data: unknown, fallback: string) => {
	if (typeof data === 'string' && data.trim()) {
		return data;
	}

	if (
		typeof data === 'object' &&
		data !== null &&
		'message' in data &&
		typeof (data as { message?: unknown }).message === 'string'
	) {
		return (data as { message: string }).message;
	}

	return fallback;
};

const normalizeHeaders = (headers?: HeadersInit): Record<string, string> => {
	const normalizedHeaders = new Headers(headers ?? {});
	return Object.fromEntries(normalizedHeaders.entries());
};

export const getSimulatorApiKey = () => SIMULATOR_API_KEY;

export const isSimulatorApiConfigured = () => Boolean(SIMULATOR_API_KEY);

const resolveSimulatorApiKey = (apiKey?: string) => {
	const resolvedApiKey = apiKey?.trim() || SIMULATOR_API_KEY;
	if (!resolvedApiKey) {
		throw new ApiError(
			'Simulator API key is required. Set VITE_SIMULATOR_API_KEY in simulator-3d/.env to persist vehicle and slot data.',
			0
		);
	}

	return resolvedApiKey;
};

export interface CreateVehicleInput {
	resident_id?: string;
	vehicle_type: 'motorbike' | 'car';
	plate_number: string;
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

export interface CreateParkingEntryInput {
	uid: string;
	plate_number: string;
	plate_confidence?: number;
	entry_image_url?: string;
	correlation_id?: string;
}

export interface AssignParkingSlotInput {
	slot_id?: string;
	correlation_id?: string;
}

export interface CompleteParkingExitInput {
	exit_plate_number: string;
	payment_status?: 'pending' | 'paid' | 'failed' | 'waived';
	exit_plate_confidence?: number;
	exit_image_url?: string;
	correlation_id?: string;
}

export interface ParkingEntryResult {
	session: SessionSummary;
	gate_action: 'open' | 'deny';
	reason?: string;
}

export interface ParkingSlotAssignmentResult {
	session: SessionSummary;
	slot: Pick<ParkingSlotRecord, '_id' | 'slot_code'>;
}

export interface ParkingExitResult {
	session: SessionSummary;
	transaction: {
		final_amount: number;
		payment_status: string;
		amount: number;
	};
	gate_action: 'open' | 'deny';
}

export interface SimulatorParkingSessionResult {
	vehicle: VehicleRecord;
	rfidCard: RfidCardRecord;
	session: SessionSummary;
	slot: Pick<ParkingSlotRecord, '_id' | 'slot_code'>;
	correlationId: string;
}

const resolveAuthKey = (apiKey?: string) => resolveSimulatorApiKey(apiKey);

export const createVehicle = async (input: CreateVehicleInput, apiKey?: string) => {
	const response = await apiRequest<ApiEnvelope<VehicleRecord>>('/vehicles', {
		method: 'POST',
		apiKey: resolveAuthKey(apiKey),
		body: JSON.stringify(input)
	});

	return response.data;
};

export const createRfidCard = async (input: CreateRfidCardInput, apiKey?: string) => {
	const response = await apiRequest<ApiEnvelope<RfidCardRecord>>('/rfid-cards', {
		method: 'POST',
		apiKey: resolveAuthKey(apiKey),
		body: JSON.stringify(input)
	});

	return response.data;
};

export const createParkingEntry = async (input: CreateParkingEntryInput, apiKey?: string) => {
	const response = await apiRequest<ApiEnvelope<ParkingEntryResult>>('/parking/sessions/entry', {
		method: 'POST',
		apiKey: resolveAuthKey(apiKey),
		body: JSON.stringify(input)
	});

	return response.data;
};

export const assignParkingSlot = async (
	sessionId: string,
	input: AssignParkingSlotInput,
	apiKey?: string
) => {
	const response = await apiRequest<ApiEnvelope<ParkingSlotAssignmentResult>>(
		`/parking/sessions/${sessionId}/assign-slot`,
		{
			method: 'POST',
			apiKey: resolveAuthKey(apiKey),
			body: JSON.stringify(input)
		}
	);

	return response.data;
};

export const completeParkingExit = async (
	sessionId: string,
	input: CompleteParkingExitInput,
	apiKey?: string
) => {
	const response = await apiRequest<ApiEnvelope<ParkingExitResult>>(
		`/parking/sessions/${sessionId}/exit`,
		{
			method: 'POST',
			apiKey: resolveAuthKey(apiKey),
			body: JSON.stringify(input)
		}
	);

	return response.data;
};

export const createSimulatorParkingSession = async (input: {
	plateNumber: string;
	uid: string;
	vehicleType?: 'motorbike' | 'car';
	plateConfidence?: number;
	entryImageUrl?: string;
	correlationId?: string;
	apiKey?: string;
}): Promise<SimulatorParkingSessionResult> => {
	const apiKey = resolveAuthKey(input.apiKey);
	const correlationId = input.correlationId?.trim() || crypto.randomUUID();
	const normalizedPlateNumber = input.plateNumber.trim().toUpperCase();
	const normalizedUid = input.uid.trim().toUpperCase();

	const vehicle = await createVehicle(
		{
			vehicle_type: input.vehicleType ?? 'car',
			plate_number: normalizedPlateNumber
		},
		apiKey
	);

	const rfidCard = await createRfidCard(
		{
			uid: normalizedUid,
			vehicle_id: vehicle._id,
			card_type: 'guest',
			is_active: true
		},
		apiKey
	);

	const entryResult = await createParkingEntry(
		{
			uid: normalizedUid,
			plate_number: normalizedPlateNumber,
			plate_confidence: input.plateConfidence ?? 100,
			entry_image_url: input.entryImageUrl,
			correlation_id: correlationId
		},
		apiKey
	);

	if (entryResult.gate_action === 'deny') {
		throw new ApiError(entryResult.reason || 'Simulator entry denied', 409, entryResult);
	}

	const slotResult = await assignParkingSlot(
		entryResult.session._id,
		{
			correlation_id: correlationId
		},
		apiKey
	);

	return {
		vehicle,
		rfidCard,
		session: slotResult.session,
		slot: slotResult.slot,
		correlationId
	};
};

export const completeSimulatorParkingExit = async (input: {
	sessionId: string;
	exitPlateNumber: string;
	paymentStatus?: 'pending' | 'paid' | 'failed' | 'waived';
	exitPlateConfidence?: number;
	exitImageUrl?: string;
	correlationId?: string;
	apiKey?: string;
}) => {
	const apiKey = resolveAuthKey(input.apiKey);
	const response = await completeParkingExit(
		input.sessionId,
		{
			exit_plate_number: input.exitPlateNumber.trim().toUpperCase(),
			payment_status: input.paymentStatus ?? 'pending',
			exit_plate_confidence: input.exitPlateConfidence,
			exit_image_url: input.exitImageUrl,
			correlation_id: input.correlationId?.trim() || crypto.randomUUID()
		},
		apiKey
	);

	return response;
};

export const apiRequest = async <T>(
	path: string,
	options: RequestOptions = {}
): Promise<T> => {
	const headers = normalizeHeaders(options.headers);
	if (!headers['Content-Type']) {
		headers['Content-Type'] = 'application/json';
	}

	if (options.token) {
		headers.Authorization = `Bearer ${options.token}`;
	}

	if (options.apiKey) {
		headers['x-simulator-api-key'] = options.apiKey;
	}

	try {
		const requestConfig = {
			url: path,
			method: options.method ?? 'GET',
			data: options.body ?? undefined,
			headers,
			signal: options.signal ?? undefined
		} as AxiosRequestConfig & { token?: string; apiKey?: string };

		const response = await apiClient.request<T>(requestConfig);

		return response.data;
	} catch (error) {
		if (error instanceof ApiError) {
			throw error;
		}

		if (axios.isAxiosError(error)) {
			const responseData = error.response?.data;
			throw new ApiError(
				getErrorMessage(responseData, error.message || 'Request failed'),
				error.response?.status ?? 0,
				responseData
			);
		}

		throw new ApiError(error instanceof Error ? error.message : 'Request failed', 0);
	}
};
