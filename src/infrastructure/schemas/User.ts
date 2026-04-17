import mongoose, { Document, Schema } from "mongoose";
import { Role } from "../../globals";

export interface IUser extends Document {
  email: string;
  name: string;
  passwordHash: string;
  companyId: mongoose.Types.ObjectId;
  role: Role;
  emailVerified: boolean;
  verificationCode: string | null;
  verificationCodeExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "member"],
      default: "member",
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    verificationCode: {
      type: String,
      default: null,
    },
    verificationCodeExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1, companyId: 1 }, { unique: true });

const User = mongoose.model<IUser>("User", userSchema);
export default User;
