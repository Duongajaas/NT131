import type { IVehicle } from '../models/vehicle.models.ts';
import RfidCard, { type CardType, type IRfidCard } from '../models/rfid-card.models.ts';
import Vehicle from '../models/vehicle.models.ts';

export interface CreateRfidCardInput {
	uid: string;
	vehicle_id: string;
	card_type?: CardType;
	is_active?: boolean;
	monthly_fee?: number;
	monthly_started_at?: Date;
	monthly_expires_at?: Date;
}

export interface UpdateRfidCardInput {
	uid?: string;
	vehicle_id?: string;
	card_type?: CardType;
	is_active?: boolean;
	monthly_fee?: number | null;
	monthly_started_at?: Date | null;
	monthly_expires_at?: Date | null;
}

export interface ListRfidCardsFilter {
	search?: string;
	card_type?: CardType;
	is_active?: boolean;
	vehicle_id?: string;
}

export const createRfidCard = async (
	input: CreateRfidCardInput
): Promise<IRfidCard> => {
	return RfidCard.create({
		uid: input.uid,
		vehicle_id: input.vehicle_id,
		card_type: input.card_type,
		is_active: input.is_active,
		monthly_fee: input.monthly_fee,
		monthly_started_at: input.monthly_started_at,
		monthly_expires_at: input.monthly_expires_at
	});
};

export const findRfidCardById = async (rfidCardId: string): Promise<IRfidCard | null> => {
	return RfidCard.findById(rfidCardId);
};

export const findRfidCardByUid = async (uid: string): Promise<IRfidCard | null> => {
	return RfidCard.findOne({ uid });
};

export const findRfidCardByVehicleId = async (
	vehicleId: string
): Promise<IRfidCard | null> => {
	return RfidCard.findOne({ vehicle_id: vehicleId });
};

export const findVehicleById = async (vehicleId: string): Promise<IVehicle | null> => {
	return Vehicle.findById(vehicleId);
};

export const listRfidCards = async (
	filter: ListRfidCardsFilter
): Promise<IRfidCard[]> => {
	const query: {
		$or?: Array<Record<string, unknown>>;
		card_type?: CardType;
		is_active?: boolean;
		vehicle_id?: string;
	} = {};

	if (filter.search) {
		query.$or = [{ uid: { $regex: filter.search, $options: 'i' } }];
	}

	if (filter.card_type) {
		query.card_type = filter.card_type;
	}

	if (filter.is_active !== undefined) {
		query.is_active = filter.is_active;
	}

	if (filter.vehicle_id) {
		query.vehicle_id = filter.vehicle_id;
	}

	return RfidCard.find(query).sort({ issued_at: -1 });
};

export const updateRfidCardById = async (
	rfidCardId: string,
	input: UpdateRfidCardInput
): Promise<IRfidCard | null> => {
	return RfidCard.findByIdAndUpdate(
		rfidCardId,
		{
			$set: input
		},
		{
			new: true,
			runValidators: true
		}
	);
};

export const deleteRfidCardById = async (rfidCardId: string): Promise<IRfidCard | null> => {
	return RfidCard.findByIdAndDelete(rfidCardId);
};