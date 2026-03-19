import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IResident extends Document {
  full_name: string;
  phone?: string;
  apartment_no: string;
  is_active: boolean;
  created_at: Date;
}

const residentSchema = new Schema<IResident>(
  {
    full_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20
    },
    apartment_no: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20
    },
    is_active: {
      type: Boolean,
      default: true
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

residentSchema.index({ apartment_no: 1 });
residentSchema.index({ phone: 1 });

const Resident =
  (mongoose.models.Resident as mongoose.Model<IResident>) ||
  mongoose.model<IResident>('Resident', residentSchema);

export default Resident;
