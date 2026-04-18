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
