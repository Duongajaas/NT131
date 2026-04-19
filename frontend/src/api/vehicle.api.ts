import { requestJson } from './http-client';
import type { ApiEnvelope, VehicleRecord } from '../types/contracts';

interface AuthOptions {
	token: string;
}

export interface CreateVehicleInput {
	resident_id?: string;
	vehicle_type: 'motorbike' | 'car';
	plate_number: string;
}

export const listVehicles = async (
	{ token }: AuthOptions,
	query?: {
		search?: string;
		vehicle_type?: 'motorbike' | 'car';
		resident_id?: string;
	}
) => {
	const params = new URLSearchParams();
	if (query?.search) {
		params.set('search', query.search);
	}
	if (query?.vehicle_type) {
		params.set('vehicle_type', query.vehicle_type);
	}
	if (query?.resident_id) {
		params.set('resident_id', query.resident_id);
	}

	const suffix = params.toString() ? `?${params.toString()}` : '';
	const response = await requestJson<ApiEnvelope<VehicleRecord[]>>(`/vehicles${suffix}`, {
		token
	});
	return response.data;
};

export const createVehicle = async (
	input: CreateVehicleInput,
	{ token }: AuthOptions
) => {
	const response = await requestJson<ApiEnvelope<VehicleRecord>>('/vehicles', {
		method: 'POST',
		token,
		body: JSON.stringify(input)
	});
	return response.data;
};

export const getVehicleById = async (vehicleId: string, { token }: AuthOptions) => {
	const response = await requestJson<ApiEnvelope<VehicleRecord>>(`/vehicles/${vehicleId}`, {
		token
	});
	return response.data;
};
