import mongoose, { Document, Schema, Types } from 'mongoose';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'waived';

export interface ITransaction extends Document {
  session_id: Types.ObjectId;
  vehicle_id: Types.ObjectId;
  rfid_card_id: Types.ObjectId;
  pricing_policy_id?: Types.ObjectId;
  amount: number;
  final_amount: number;
  payment_status: PaymentStatus;
  paid_at?: Date;
  created_at: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    session_id: {
      type: Schema.Types.ObjectId,
      ref: 'ParkingSession',
      required: true,
      unique: true
    },
    vehicle_id: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true
    },
    rfid_card_id: {
      type: Schema.Types.ObjectId,
      ref: 'RfidCard',
      required: true
    },
    pricing_policy_id: {
      type: Schema.Types.ObjectId,
      ref: 'PricingPolicy'
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    final_amount: {
      type: Number,
      required: true,
      min: 0
    },
    payment_status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'waived'],
      default: 'pending'
    },
    paid_at: {
      type: Date
    },
    created_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    versionKey: false
  }
);

transactionSchema.index({ payment_status: 1, created_at: -1 });
transactionSchema.index({ rfid_card_id: 1, created_at: -1 });

const Transaction =
  (mongoose.models.Transaction as mongoose.Model<ITransaction>) ||
  mongoose.model<ITransaction>('Transaction', transactionSchema);

export default Transaction;
