import mongoose, { Document, Schema } from "mongoose";

export interface INotification extends Document {
  companyId: mongoose.Types.ObjectId;
  type: string;
  title: string;
  message: string;
  read: boolean;
  orderId?: mongoose.Types.ObjectId | null;
  link?: string | null;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    link: { type: String, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ companyId: 1, createdAt: -1 });
notificationSchema.index({ companyId: 1, read: 1 });

const Notification = mongoose.model<INotification>("Notification", notificationSchema);
export default Notification;
