import PricingPolicy, { type IPricingPolicy } from '../models/pricing-policy.models.ts';
import type { CardType } from '../models/rfid-card.models.ts';
import type { VehicleType } from '../models/vehicle.models.ts';

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
