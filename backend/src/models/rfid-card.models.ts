import mongoose, { Document, Schema, Types } from 'mongoose';

export type CardType = 'monthly' | 'guest';

export interface IRfidCard extends Document {
  uid: string;
  vehicle_id: Types.ObjectId;
  card_type: CardType;
  is_active: boolean;
  monthly_fee?: number;
  monthly_started_at?: Date;
  monthly_expires_at?: Date;
  issued_at: Date;
}

const rfidCardSchema = new Schema<IRfidCard>(
  {
    uid: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 50
    },
    vehicle_id: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true
    },
    card_type: {
      type: String,
      enum: ['monthly', 'guest'],
      default: 'guest'
    },
    is_active: {
      type: Boolean,
      default: true
    },
    monthly_fee: {
      type: Number,
      min: 0
    },
    monthly_started_at: {
      type: Date
    },
    monthly_expires_at: {
      type: Date
    },
    issued_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    versionKey: false
  }
);

rfidCardSchema.index({ vehicle_id: 1 }, { unique: true });
rfidCardSchema.index({ card_type: 1, is_active: 1 });

const RfidCard =
  (mongoose.models.RfidCard as mongoose.Model<IRfidCard>) ||
  mongoose.model<IRfidCard>('RfidCard', rfidCardSchema);

export default RfidCard;
