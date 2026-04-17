import mongoose, { Document, Schema } from "mongoose";
import { Role } from "../../globals";

export interface IInvitation extends Document {
  email: string;
  companyId: mongoose.Types.ObjectId;
  role: Role;
  token: string;
  status: "pending" | "accepted" | "expired";
  invitedBy: mongoose.Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const invitationSchema = new Schema<IInvitation>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
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
    token: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "expired"],
      default: "pending",
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

invitationSchema.index({ email: 1, companyId: 1 });

const Invitation = mongoose.model<IInvitation>("Invitation", invitationSchema);
export default Invitation;
