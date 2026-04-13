import mongoose, { Document, Schema, Types } from 'mongoose';

export type ParkingSlotType = 'regular' | 'motorbike' | 'handicap';

export interface IParkingSlot extends Document {
	slot_code: string;
	level: number;
	slot_type: ParkingSlotType;
	is_occupied: boolean;
	current_session_id?: Types.ObjectId;
	created_at: Date;
}

const parkingSlotSchema = new Schema<IParkingSlot>(
	{
		slot_code: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			uppercase: true,
			maxlength: 50
		},
		level: {
			type: Number,
			required: true,
			min: 0
		},
		slot_type: {
			type: String,
			enum: ['regular', 'motorbike', 'handicap'],
			default: 'regular'
		},
		is_occupied: {
			type: Boolean,
			default: false
		},
		current_session_id: {
			type: Schema.Types.ObjectId,
			ref: 'ParkingSession'
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

parkingSlotSchema.index({ level: 1, slot_type: 1, is_occupied: 1 });

const ParkingSlot =
	(mongoose.models.ParkingSlot as mongoose.Model<IParkingSlot>) ||
	mongoose.model<IParkingSlot>('ParkingSlot', parkingSlotSchema);

export default ParkingSlot;
