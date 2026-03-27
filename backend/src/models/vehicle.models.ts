import mongoose, { Document, Schema, Types } from 'mongoose';

export type VehicleType = 'motorbike' | 'car';

export interface IVehicle extends Document {
  resident_id?: Types.ObjectId;
  vehicle_type: VehicleType;
  plate_number: string;
  created_at: Date;
}

const vehicleSchema = new Schema<IVehicle>(
  {
    resident_id: {
      type: Schema.Types.ObjectId,
      ref: 'Resident'
    },
    vehicle_type: {
      type: String,
      enum: ['motorbike', 'car'],
      required: true
    },
    plate_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 20
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

vehicleSchema.index({ resident_id: 1 });

const Vehicle =
  (mongoose.models.Vehicle as mongoose.Model<IVehicle>) ||
  mongoose.model<IVehicle>('Vehicle', vehicleSchema);

export default Vehicle;
