import {
	createResident,
	deleteResidentById,
	findResidentById,
	findResidentByPhone,
	listResidents,
	type CreateResidentInput,
	type UpdateResidentInput,
	updateResidentById
} from '../repositories/resident.repository.ts';
import AppError from '../utills/app-error.ts';

interface ListResidentsInput {
	search?: string;
	is_active?: boolean;
}

// Tạo mới một cư dân
export const create = async (input: CreateResidentInput) => {
	if (input.phone) {
		const existingResident = await findResidentByPhone(input.phone);
		if (existingResident) {
			throw new AppError('Phone number already exists', 409);
		}
	}

	return createResident(input);
};

// Lấy danh sách cư dân với bộ lọc
export const list = async (input: ListResidentsInput) => {
	return listResidents(input);
};

// Lấy thông tin cư dân theo ID
export const getById = async (residentId: string) => {
	const resident = await findResidentById(residentId);
	if (!resident) {
		throw new AppError('Resident not found', 404);
	}

	return resident;
};

// Cập nhật thông tin cư dân
export const update = async (residentId: string, input: UpdateResidentInput) => {
	const resident = await findResidentById(residentId);
	if (!resident) {
		throw new AppError('Resident not found', 404);
	}

	if (input.phone) {
		const existingResident = await findResidentByPhone(input.phone);
		if (existingResident && existingResident._id.toString() !== residentId) {
			throw new AppError('Phone number already exists', 409);
		}
	}

	const updatedResident = await updateResidentById(residentId, input);
	if (!updatedResident) {
		throw new AppError('Failed to update resident', 500);
	}

	return updatedResident;
};

// Xóa cư dân
export const remove = async (residentId: string) => {
	const resident = await deleteResidentById(residentId);
	if (!resident) {
		throw new AppError('Resident not found', 404);
	}

	return resident;
};