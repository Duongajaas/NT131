import {
	createVehicle,
	deleteVehicleById,
	findResidentById,
	findVehicleById,
	findVehicleByPlateNumber,
	listVehicles,
	type CreateVehicleInput,
	type ListVehiclesFilter,
	type UpdateVehicleInput,
	updateVehicleById
} from '../repositories/vehicle.repository.ts';
import AppError from '../utills/app-error.ts';

const normalizePlateNumber = (plateNumber: string) => plateNumber.trim().toUpperCase();

// Tạo mới một phương tiện
export const create = async (input: CreateVehicleInput) => {
	const normalizedPlateNumber = normalizePlateNumber(input.plate_number);

    // Kiểm tra nếu resident_id được cung cấp, xác minh rằng nó tồn tại
	if (input.resident_id) {
		const resident = await findResidentById(input.resident_id);
		if (!resident) {
			throw new AppError('Resident not found', 404);
		}
	}

	const existingVehicle = await findVehicleByPlateNumber(normalizedPlateNumber);
	if (existingVehicle) {
		throw new AppError('Plate number already exists', 409);
	}

	return createVehicle({
		...input,
		plate_number: normalizedPlateNumber
	});
};

// Lấy danh sách phương tiện của cư dân với bộ lọc
export const list = async (input: ListVehiclesFilter) => {
	if (input.resident_id) {
		const resident = await findResidentById(input.resident_id);
		if (!resident) {
			throw new AppError('Resident not found', 404);
		}
	}

	return listVehicles(input);
};

// Lấy thông tin phương tiện theo ID
export const getById = async (vehicleId: string) => {
	const vehicle = await findVehicleById(vehicleId);
	if (!vehicle) {
		throw new AppError('Vehicle not found', 404);
	}

	return vehicle;
};

// Cập nhật thông tin phương tiện
export const update = async (vehicleId: string, input: UpdateVehicleInput) => {
	const existingVehicle = await findVehicleById(vehicleId);
	if (!existingVehicle) {
		throw new AppError('Vehicle not found', 404);
	}

	const normalizedPlateNumber = input.plate_number
		? normalizePlateNumber(input.plate_number)
		: undefined;

	if (normalizedPlateNumber) {
		const duplicateVehicle = await findVehicleByPlateNumber(normalizedPlateNumber);
		if (duplicateVehicle && duplicateVehicle._id.toString() !== vehicleId) {
			throw new AppError('Plate number already exists', 409);
		}
	}

	if (input.resident_id) {
		const resident = await findResidentById(input.resident_id);
		if (!resident) {
			throw new AppError('Resident not found', 404);
		}
	}

	const updatedVehicle = await updateVehicleById(vehicleId, {
		...input,
		plate_number: normalizedPlateNumber
	});

	if (!updatedVehicle) {
		throw new AppError('Failed to update vehicle', 500);
	}

	return updatedVehicle;
};

// Xóa phương tiện
export const remove = async (vehicleId: string) => {
	const vehicle = await deleteVehicleById(vehicleId);
	if (!vehicle) {
		throw new AppError('Vehicle not found', 404);
	}

	return vehicle;
};