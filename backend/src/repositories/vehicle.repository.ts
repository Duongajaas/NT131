import type { IResident } from '../models/resident.models.ts';
import Resident from '../models/resident.models.ts';
import type { IVehicle, VehicleType } from '../models/vehicle.models.ts';
import Vehicle from '../models/vehicle.models.ts';

export interface CreateVehicleInput {
	resident_id?: string;
	vehicle_type: VehicleType;
	plate_number: string;
}

export interface UpdateVehicleInput {
	resident_id?: string | null;
	vehicle_type?: VehicleType;
	plate_number?: string;
}

export interface ListVehiclesFilter {
	search?: string;
	vehicle_type?: VehicleType;
	resident_id?: string;
}

export const createVehicle = async (input: CreateVehicleInput): Promise<IVehicle> => {
	return Vehicle.create({
		resident_id: input.resident_id,
		vehicle_type: input.vehicle_type,
		plate_number: input.plate_number
	});
};

export const findVehicleById = async (vehicleId: string): Promise<IVehicle | null> => {
	return Vehicle.findById(vehicleId);
};

export const findVehicleByPlateNumber = async (
	plateNumber: string
): Promise<IVehicle | null> => {
	return Vehicle.findOne({ plate_number: plateNumber });
};

export const findResidentById = async (residentId: string): Promise<IResident | null> => {
	return Resident.findById(residentId);
};

export const listVehicles = async (filter: ListVehiclesFilter): Promise<IVehicle[]> => {
	const query: {
		$or?: Array<Record<string, unknown>>;
		vehicle_type?: VehicleType;
		resident_id?: string;
	} = {};

	if (filter.search) {
		query.$or = [{ plate_number: { $regex: filter.search, $options: 'i' } }];
	}

	if (filter.vehicle_type) {
		query.vehicle_type = filter.vehicle_type;
	}

	if (filter.resident_id) {
		query.resident_id = filter.resident_id;
	}

	return Vehicle.find(query).sort({ created_at: -1 });
};

export const updateVehicleById = async (
	vehicleId: string,
	input: UpdateVehicleInput
): Promise<IVehicle | null> => {
	return Vehicle.findByIdAndUpdate(
		vehicleId,
		{
			$set: input
		},
		{
			new: true,
			runValidators: true
		}
	);
};

export const deleteVehicleById = async (vehicleId: string): Promise<IVehicle | null> => {
	return Vehicle.findByIdAndDelete(vehicleId);
};