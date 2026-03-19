import mongoose, { Document, Schema, Types } from 'mongoose';

export type SessionStatus = 'active' | 'completed' | 'blocked';

export interface IParkingSession extends Document {
  vehicle_id: Types.ObjectId;
  rfid_card_id: Types.ObjectId;
  status: SessionStatus;
  entry_time: Date;
  exit_time?: Date;
  duration_minutes?: number;
  entry_plate_text?: string;
  exit_plate_text?: string;
  entry_plate_confidence?: number;
  exit_plate_confidence?: number;
  entry_image_url?: string;
  exit_image_url?: string;
  is_plate_mismatch: boolean;
  created_at: Date;
}

const parkingSessionSchema = new Schema<IParkingSession>(
  {
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
    status: {
      type: String,
      enum: ['active', 'completed', 'blocked'],
      default: 'active'
    },
    entry_time: {
      type: Date,
      default: Date.now,
      required: true
    },
    exit_time: {
      type: Date
    },
    duration_minutes: {
      type: Number,
      min: 0
    },
    entry_plate_text: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 20
    },
    exit_plate_text: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 20
    },
    entry_plate_confidence: {
      type: Number,
      min: 0,
      max: 100
    },
    exit_plate_confidence: {
      type: Number,
      min: 0,
      max: 100
    },
    entry_image_url: {
      type: String,
      trim: true,
      maxlength: 255
    },
    exit_image_url: {
      type: String,
      trim: true,
      maxlength: 255
    },
    is_plate_mismatch: {
      type: Boolean,
      default: false
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

parkingSessionSchema.index({ rfid_card_id: 1, status: 1 });
parkingSessionSchema.index({ vehicle_id: 1, status: 1 });
parkingSessionSchema.index({ entry_time: -1 });

const ParkingSession =
  (mongoose.models.ParkingSession as mongoose.Model<IParkingSession>) ||
  mongoose.model<IParkingSession>('ParkingSession', parkingSessionSchema);

export default ParkingSession;
