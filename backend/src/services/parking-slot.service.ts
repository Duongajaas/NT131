import {
	createParkingSlot,
	findParkingSlotByCode,
	findParkingSlotById,
	listParkingSlots,
	releaseParkingSlot,
	type CreateParkingSlotInput,
	type ListParkingSlotsFilter
} from '../repositories/parking-slot.repository.ts';
import AppError from '../utills/app-error.ts';

const normalizeSlotCode = (slotCode: string) => slotCode.trim().toUpperCase();

export const create = async (input: CreateParkingSlotInput) => {
	const normalizedSlotCode = normalizeSlotCode(input.slot_code);
	const existingSlot = await findParkingSlotByCode(normalizedSlotCode);
	if (existingSlot) {
		throw new AppError('Parking slot code already exists', 409);
	}

	return createParkingSlot({
		...input,
		slot_code: normalizedSlotCode
	});
};

export const list = async (input: ListParkingSlotsFilter) => {
	return listParkingSlots(input);
};

export const getById = async (slotId: string) => {
	const slot = await findParkingSlotById(slotId);
	if (!slot) {
		throw new AppError('Parking slot not found', 404);
	}

	return slot;
};

export const release = async (slotId: string) => {
	const slot = await findParkingSlotById(slotId);
	if (!slot) {
		throw new AppError('Parking slot not found', 404);
	}

	const released = await releaseParkingSlot(slotId);
	if (!released) {
		throw new AppError('Failed to release parking slot', 500);
	}

	return released;
};
