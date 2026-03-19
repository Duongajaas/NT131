import mongoose, { Document, Schema, Types } from 'mongoose';

export type PricingVehicleType = 'motorbike' | 'car';
export type PricingCardType = 'monthly' | 'guest';

export interface IPricingPolicy extends Document {
  vehicle_type: PricingVehicleType;
  card_type: PricingCardType;
  price_per_hour: number;
  free_minutes: number;
  is_active: boolean;
  effective_from: Date;
}

const pricingPolicySchema = new Schema<IPricingPolicy>(
  {
    vehicle_type: {
      type: String,
      enum: ['motorbike', 'car'],
      required: true
    },
    card_type: {
      type: String,
      enum: ['monthly', 'guest'],
      default: 'guest'
    },
    price_per_hour: {
      type: Number,
      required: true,
      min: 0
    },
    free_minutes: {
      type: Number,
      default: 15,
      min: 0
    },
    is_active: {
      type: Boolean,
      default: true
    },
    effective_from: {
      type: Date,
      default: Date.now
    }
  },
  {
    versionKey: false
  }
);

pricingPolicySchema.index({ vehicle_type: 1, card_type: 1, is_active: 1 });

const PricingPolicy =
  (mongoose.models.PricingPolicy as mongoose.Model<IPricingPolicy>) ||
  mongoose.model<IPricingPolicy>('PricingPolicy', pricingPolicySchema);

export default PricingPolicy;
