import type { SessionStatus } from '../models/parking-session.models.ts';
import ParkingSession from '../models/parking-session.models.ts';
import ParkingSlot, {
	type IParkingSlot,
	type ParkingSlotType
} from '../models/parking-slot.models.ts';

export interface CreateParkingSlotInput {
	slot_code: string;
	level: number;
	slot_type?: ParkingSlotType;
}

export interface ListParkingSlotsFilter {
	level?: number;
	slot_type?: ParkingSlotType;
	is_occupied?: boolean;
}

export const createParkingSlot = async (
	input: CreateParkingSlotInput
): Promise<IParkingSlot> => {
	return ParkingSlot.create(input);
};

export const findParkingSlotById = async (slotId: string): Promise<IParkingSlot | null> => {
	return ParkingSlot.findById(slotId);
};

export const findParkingSlotByCode = async (
	slotCode: string
): Promise<IParkingSlot | null> => {
	return ParkingSlot.findOne({ slot_code: slotCode });
};

export const listParkingSlots = async (
	filter: ListParkingSlotsFilter
): Promise<IParkingSlot[]> => {
	const query: {
		level?: number;
		slot_type?: ParkingSlotType;
		is_occupied?: boolean;
	} = {};

	if (filter.level !== undefined) {
		query.level = filter.level;
	}

	if (filter.slot_type) {
		query.slot_type = filter.slot_type;
	}

	if (filter.is_occupied !== undefined) {
		query.is_occupied = filter.is_occupied;
	}

	return ParkingSlot.find(query).sort({ level: 1, slot_code: 1 });
};

export const findAvailableSlot = async (
	preferredType: ParkingSlotType
): Promise<IParkingSlot | null> => {
	return ParkingSlot.findOne({
		slot_type: preferredType,
		is_occupied: false
	}).sort({ level: 1, slot_code: 1 });
};

export const occupyParkingSlot = async (
	slotId: string,
	sessionId: string
): Promise<IParkingSlot | null> => {
	return ParkingSlot.findByIdAndUpdate(
		slotId,
		{
			$set: {
				is_occupied: true,
				current_session_id: sessionId
			}
		},
		{
			new: true,
			runValidators: true
		}
	);
};

export const releaseParkingSlot = async (slotId: string): Promise<IParkingSlot | null> => {
	return ParkingSlot.findByIdAndUpdate(
		slotId,
		{
			$set: {
				is_occupied: false
			},
			$unset: {
				current_session_id: ''
			}
		},
		{
			new: true,
			runValidators: true
		}
	);
};

export const findParkingSlotBySessionId = async (
	sessionId: string
): Promise<IParkingSlot | null> => {
	return ParkingSlot.findOne({ current_session_id: sessionId });
};

export const countParkingSlots = async (isOccupied?: boolean): Promise<number> => {
	if (isOccupied === undefined) {
		return ParkingSlot.countDocuments({});
	}

	return ParkingSlot.countDocuments({ is_occupied: isOccupied });
};

export const listActiveSessions = async (): Promise<SessionStatus[]> => {
	const sessions = await ParkingSession.find(
		{ status: { $in: ['waiting_scan', 'approved_entry', 'active', 'parked', 'exit_pending'] } },
		{ status: 1 }
	).lean();

	return sessions.map((session) => session.status as SessionStatus);
};
