import {
	createRfidCard,
	deleteRfidCardById,
	findRfidCardById,
	findRfidCardByUid,
	findRfidCardByVehicleId,
	findVehicleById,
	listRfidCards,
	type CreateRfidCardInput,
	type ListRfidCardsFilter,
	type UpdateRfidCardInput,
	updateRfidCardById
} from '../repositories/rfid-card.repository.ts';
import AppError from '../utills/app-error.ts';

const normalizeUid = (uid: string) => uid.trim().toUpperCase();

export const create = async (input: CreateRfidCardInput) => {
	const normalizedUid = normalizeUid(input.uid);

	const vehicle = await findVehicleById(input.vehicle_id);
	if (!vehicle) {
		throw new AppError('Vehicle not found', 404);
	}

	const existingByUid = await findRfidCardByUid(normalizedUid);
	if (existingByUid) {
		throw new AppError('RFID card UID already exists', 409);
	}

	const existingByVehicle = await findRfidCardByVehicleId(input.vehicle_id);
	if (existingByVehicle) {
		throw new AppError('Vehicle already has an RFID card', 409);
	}

	return createRfidCard({
		...input,
		uid: normalizedUid
	});
};

export const list = async (input: ListRfidCardsFilter) => {
	return listRfidCards(input);
};

export const getById = async (rfidCardId: string) => {
	const rfidCard = await findRfidCardById(rfidCardId);
	if (!rfidCard) {
		throw new AppError('RFID card not found', 404);
	}

	return rfidCard;
};

export const update = async (rfidCardId: string, input: UpdateRfidCardInput) => {
	const existingRfidCard = await findRfidCardById(rfidCardId);
	if (!existingRfidCard) {
		throw new AppError('RFID card not found', 404);
	}

	const normalizedUid = input.uid ? normalizeUid(input.uid) : undefined;
	if (normalizedUid) {
		const duplicateUid = await findRfidCardByUid(normalizedUid);
		if (duplicateUid && duplicateUid._id.toString() !== rfidCardId) {
			throw new AppError('RFID card UID already exists', 409);
		}
	}

	if (input.vehicle_id) {
		const vehicle = await findVehicleById(input.vehicle_id);
		if (!vehicle) {
			throw new AppError('Vehicle not found', 404);
		}

		const duplicateVehicle = await findRfidCardByVehicleId(input.vehicle_id);
		if (duplicateVehicle && duplicateVehicle._id.toString() !== rfidCardId) {
			throw new AppError('Vehicle already has an RFID card', 409);
		}
	}

	const updatedRfidCard = await updateRfidCardById(rfidCardId, {
		...input,
		uid: normalizedUid
	});

	if (!updatedRfidCard) {
		throw new AppError('Failed to update RFID card', 500);
	}

	return updatedRfidCard;
};

export const remove = async (rfidCardId: string) => {
	const rfidCard = await deleteRfidCardById(rfidCardId);
	if (!rfidCard) {
		throw new AppError('RFID card not found', 404);
	}

	return rfidCard;
};