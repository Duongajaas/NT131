import PricingPolicy, { type IPricingPolicy } from '../models/pricing-policy.models.ts';
import type { CardType } from '../models/rfid-card.models.ts';
import type { VehicleType } from '../models/vehicle.models.ts';

export interface CreatePricingPolicyInput {
	vehicle_type: VehicleType;
	card_type?: CardType;
	price_per_hour: number;
	free_minutes?: number;
	is_active?: boolean;
	effective_from?: Date;
}

export interface ListPricingPoliciesFilter {
	vehicle_type?: VehicleType;
	card_type?: CardType;
	is_active?: boolean;
}

export interface UpdatePricingPolicyInput {
	vehicle_type?: VehicleType;
	card_type?: CardType;
	price_per_hour?: number;
	free_minutes?: number;
	is_active?: boolean;
	effective_from?: Date;
}

export const findActivePricingPolicy = async (
	vehicleType: VehicleType,
	cardType: CardType
): Promise<IPricingPolicy | null> => {
	return PricingPolicy.findOne({
		vehicle_type: vehicleType,
		card_type: cardType,
		is_active: true,
		effective_from: { $lte: new Date() }
	}).sort({ effective_from: -1 });
};

export const listPricingPolicies = async (
	filter: ListPricingPoliciesFilter = {}
): Promise<IPricingPolicy[]> => {
	const query: Record<string, unknown> = {};

	if (filter.vehicle_type) {
		query.vehicle_type = filter.vehicle_type;
	}

	if (filter.card_type) {
		query.card_type = filter.card_type;
	}

	if (typeof filter.is_active === 'boolean') {
		query.is_active = filter.is_active;
	}

	return PricingPolicy.find(query).sort({ effective_from: -1, created_at: -1 });
};

export const findPricingPolicyById = async (pricingPolicyId: string): Promise<IPricingPolicy | null> => {
	return PricingPolicy.findById(pricingPolicyId);
};

export const createPricingPolicy = async (
	input: CreatePricingPolicyInput
): Promise<IPricingPolicy> => {
	return PricingPolicy.create({
		vehicle_type: input.vehicle_type,
		card_type: input.card_type ?? 'guest',
		price_per_hour: input.price_per_hour,
		free_minutes: input.free_minutes ?? 0,
		is_active: input.is_active ?? true,
		effective_from: input.effective_from ?? new Date()
	});
};

export const updatePricingPolicyById = async (
	pricingPolicyId: string,
	input: UpdatePricingPolicyInput
): Promise<IPricingPolicy | null> => {
	return PricingPolicy.findByIdAndUpdate(
		pricingPolicyId,
		{
			$set: input
		},
		{
			new: true,
			runValidators: true
		}
	);
};
