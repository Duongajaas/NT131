import mongoose, { Document, Model, Schema } from 'mongoose';

export type UserRole = 'admin' | 'operator';

export interface IUser extends Document {
  username: string;
  password: string;
  full_name?: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 50
    },
    password: {
      type: String,
      required: true,
      minlength: 6
    },
    full_name: {
      type: String,
      trim: true,
      maxlength: 100
    },
    role: {
      type: String,
      enum: ['admin', 'operator'],
      default: 'operator'
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

const User = mongoose.model<IUser>('User', userSchema);

export default User;