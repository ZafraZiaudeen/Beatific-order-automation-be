import mongoose, { Document, Schema } from "mongoose";

export type EtsyOrderStatus =
  | "new"
  | "custom_orders"
  | "waiting"
  | "drawings"
  | "ready_to_order"
  | "in_progress"
  | "completed";

export type LuluOrderStatus =
  | "pending"
  | "submitted"
  | "in_production"
  | "shipped"
  | "failed";

export interface IOrder extends Document {
  etsyOrderId: string;
  etsyReceiptId: string | null;
  companyId: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId | null;
  listingId: string | null;

  // Status
  etsyStatus: EtsyOrderStatus;
  luluStatus: LuluOrderStatus | null;

  // Customer
  customerName: string;
  customerEmail: string | null;
  shippingAddress: {
    name: string;
    street1: string;
    street2: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };

  // Product details
  productTitle: string;
  personalization: Record<string, string>;
  quantity: number;
  price: number;
  shippingCost: number;

  // Images
  coverImageUrl: string | null;
  interiorPdfUrl: string | null;

  // Lulu
  luluJobId: string | null;
  podPackageId: string | null;
  trackingNumber: string | null;

  // Dates
  shipByDate: Date | null;
  orderedAt: Date | null;

  // Flags
  aiFlags: string[];
  notes: string;
  hasCustomArtwork: boolean;
  isProductMapped: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    etsyOrderId: { type: String, required: true },
    etsyReceiptId: { type: String, default: null },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    listingId: { type: String, default: null },

    etsyStatus: {
      type: String,
      enum: ["new", "custom_orders", "waiting", "drawings", "ready_to_order", "in_progress", "completed"],
      default: "new",
    },
    luluStatus: {
      type: String,
      enum: ["pending", "submitted", "in_production", "shipped", "failed", null],
      default: null,
    },

    customerName: { type: String, required: true, trim: true },
    customerEmail: { type: String, default: null, trim: true },
    shippingAddress: {
      name: { type: String, default: "" },
      street1: { type: String, default: "" },
      street2: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      zip: { type: String, default: "" },
      country: { type: String, default: "" },
    },

    productTitle: { type: String, required: true, trim: true },
    personalization: { type: Schema.Types.Mixed, default: {} },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, default: 0 },
    shippingCost: { type: Number, default: 0 },

    coverImageUrl: { type: String, default: null },
    interiorPdfUrl: { type: String, default: null },

    luluJobId: { type: String, default: null },
    podPackageId: { type: String, default: null },
    trackingNumber: { type: String, default: null },

    shipByDate: { type: Date, default: null },
    orderedAt: { type: Date, default: null },

    aiFlags: [{ type: String }],
    notes: { type: String, default: "" },
    hasCustomArtwork: { type: Boolean, default: false },
    isProductMapped: { type: Boolean, default: false },
  },
  { timestamps: true }
);

orderSchema.index({ etsyOrderId: 1, companyId: 1 }, { unique: true });
orderSchema.index({ companyId: 1, storeId: 1, etsyStatus: 1 });
orderSchema.index({ companyId: 1, luluStatus: 1 });
orderSchema.index({ shipByDate: 1 });

const Order = mongoose.model<IOrder>("Order", orderSchema);
export default Order;
