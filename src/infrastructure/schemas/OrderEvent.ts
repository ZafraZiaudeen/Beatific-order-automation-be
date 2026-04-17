import mongoose, { Document, Schema } from "mongoose";

export interface IOrderEvent extends Document {
  orderId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  fromStatus: string | null;
  toStatus: string;
  statusType: "etsy" | "lulu";
  userId: mongoose.Types.ObjectId | null;
  note: string;
  createdAt: Date;
}

const orderEventSchema = new Schema<IOrderEvent>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    fromStatus: {
      type: String,
      default: null,
    },
    toStatus: {
      type: String,
      required: true,
    },
    statusType: {
      type: String,
      enum: ["etsy", "lulu"],
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    note: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

orderEventSchema.index({ orderId: 1, createdAt: -1 });

const OrderEvent = mongoose.model<IOrderEvent>("OrderEvent", orderEventSchema);
export default OrderEvent;
