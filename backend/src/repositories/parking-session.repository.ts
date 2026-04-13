import ParkingSession, {
	type IParkingSession,
	type SessionStatus
} from '../models/parking-session.models.ts';

export interface CreateParkingSessionInput {
	vehicle_id: string;
	rfid_card_id: string;
	status?: SessionStatus;
	entry_plate_text?: string;
	entry_plate_confidence?: number;
	entry_image_url?: string;
	is_plate_mismatch?: boolean;
}

export interface CompleteParkingSessionInput {
	exit_plate_text?: string;
	exit_plate_confidence?: number;
	exit_image_url?: string;
	duration_minutes: number;
	is_plate_mismatch: boolean;
	status: SessionStatus;
}

export interface ListParkingSessionsFilter {
	status?: SessionStatus;
	rfid_card_id?: string;
	vehicle_id?: string;
}

export const createParkingSession = async (
	input: CreateParkingSessionInput
): Promise<IParkingSession> => {
	return ParkingSession.create({
		vehicle_id: input.vehicle_id,
		rfid_card_id: input.rfid_card_id,
		status: input.status,
		entry_plate_text: input.entry_plate_text,
		entry_plate_confidence: input.entry_plate_confidence,
		entry_image_url: input.entry_image_url,
		is_plate_mismatch: input.is_plate_mismatch
	});
};

export const findParkingSessionById = async (
	sessionId: string
): Promise<IParkingSession | null> => {
	return ParkingSession.findById(sessionId);
};

export const listParkingSessions = async (
	filter: ListParkingSessionsFilter
): Promise<IParkingSession[]> => {
	const query: {
		status?: SessionStatus;
		rfid_card_id?: string;
		vehicle_id?: string;
	} = {};

	if (filter.status) {
		query.status = filter.status;
	}

	if (filter.rfid_card_id) {
		query.rfid_card_id = filter.rfid_card_id;
	}

	if (filter.vehicle_id) {
		query.vehicle_id = filter.vehicle_id;
	}

	return ParkingSession.find(query).sort({ entry_time: -1 });
};

export const findLatestSessionByRfidCardId = async (
	rfidCardId: string
): Promise<IParkingSession | null> => {
	return ParkingSession.findOne({ rfid_card_id: rfidCardId }).sort({ entry_time: -1 });
};

export const findActiveSessionByRfidCardId = async (
	rfidCardId: string
): Promise<IParkingSession | null> => {
	return ParkingSession.findOne({
		rfid_card_id: rfidCardId,
		status: { $in: ['waiting_scan', 'approved_entry', 'active', 'parked', 'exit_pending'] }
	});
};

export const updateParkingSessionStatus = async (
	sessionId: string,
	status: SessionStatus
): Promise<IParkingSession | null> => {
	return ParkingSession.findByIdAndUpdate(
		sessionId,
		{ $set: { status } },
		{ new: true, runValidators: true }
	);
};

export const completeParkingSession = async (
	sessionId: string,
	input: CompleteParkingSessionInput
): Promise<IParkingSession | null> => {
	return ParkingSession.findByIdAndUpdate(
		sessionId,
		{
			$set: {
				exit_time: new Date(),
				duration_minutes: input.duration_minutes,
				exit_plate_text: input.exit_plate_text,
				exit_plate_confidence: input.exit_plate_confidence,
				exit_image_url: input.exit_image_url,
				is_plate_mismatch: input.is_plate_mismatch,
				status: input.status
			}
		},
		{ new: true, runValidators: true }
	);
};
