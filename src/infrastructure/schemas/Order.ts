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
  etsyItemId?: string;  // unique per line-item in channel exports (e.g. 4026826744a)
  etsyReceiptId: string | null;
  sku: string | null;
  companyId: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId | null;
  listingId: string | null;

  ingestSource: string | null;
  projectName: string | null;
  suffix: string | null;
  totalItemsInOrder: number | null;
  itemIndexInOrder: number | null;
  isFirstItem: boolean;
  shop: string | null;
  option1Name: string | null;
  option1Value: string | null;
  option2Name: string | null;
  option2Value: string | null;
  buyerNote: string | null;
  pricing: Record<string, unknown> | null;
  rawIngestPayload: Record<string, unknown> | null;

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
  requiresTemplateFinalization: boolean;
  templateFieldValues: Record<string, string>;
  templateAiSuggestions: Record<string, string>;
  templateWarnings: string[];
  templateFinalizedAt: Date | null;

  // Lulu
  luluJobId: string | null;
  podPackageId: string | null;
  shippingLevel: string;
  trackingNumber: string | null;

  // Dates
  shipByDate: Date | null;
  orderedAt: Date | null;

  // Variant
  matchedVariantId: string | null;
  matchedVariantName: string | null;

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
    etsyItemId: {
      type: String,
      default: undefined,
      set: (value: unknown) => {
        if (typeof value !== "string") return undefined;
        const trimmed = value.trim();
        return trimmed ? trimmed : undefined;
      },
    },
    etsyReceiptId: { type: String, default: null },
    sku: { type: String, default: null },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    listingId: { type: String, default: null },

    ingestSource: { type: String, default: null, trim: true },
    projectName: { type: String, default: null, trim: true },
    suffix: { type: String, default: null, trim: true },
    totalItemsInOrder: { type: Number, default: null },
    itemIndexInOrder: { type: Number, default: null },
    isFirstItem: { type: Boolean, default: true },
    shop: { type: String, default: null, trim: true },
    option1Name: { type: String, default: null, trim: true },
    option1Value: { type: String, default: null, trim: true },
    option2Name: { type: String, default: null, trim: true },
    option2Value: { type: String, default: null, trim: true },
    buyerNote: { type: String, default: null },
    pricing: { type: Schema.Types.Mixed, default: null },
    rawIngestPayload: { type: Schema.Types.Mixed, default: null },

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
    requiresTemplateFinalization: { type: Boolean, default: false },
    templateFieldValues: { type: Schema.Types.Mixed, default: {} },
    templateAiSuggestions: { type: Schema.Types.Mixed, default: {} },
    templateWarnings: [{ type: String }],
    templateFinalizedAt: { type: Date, default: null },

    luluJobId: { type: String, default: null },
    podPackageId: { type: String, default: null },
    shippingLevel: { type: String, default: "MAIL" },
    trackingNumber: { type: String, default: null },

    shipByDate: { type: Date, default: null },
    orderedAt: { type: Date, default: null },

    matchedVariantId: { type: String, default: null },
    matchedVariantName: { type: String, default: null },

    aiFlags: [{ type: String }],
    notes: { type: String, default: "" },
    hasCustomArtwork: { type: Boolean, default: false },
    isProductMapped: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// etsyItemId uniquely identifies a single line-item in channel exports.
// Use a partial index so missing/null/empty values are ignored.
// Note: $ne is not supported in partialFilterExpression; use $gt: "" instead.
orderSchema.index(
  { etsyItemId: 1, companyId: 1 },
  {
    unique: true,
    partialFilterExpression: { etsyItemId: { $exists: true, $gt: "" } },
  }
);
// etsyOrderId is no longer unique — one order ID can map to multiple line items
orderSchema.index({ etsyOrderId: 1, companyId: 1 });
orderSchema.index({ companyId: 1, storeId: 1, etsyStatus: 1 });
orderSchema.index({ companyId: 1, luluStatus: 1 });
orderSchema.index({ shipByDate: 1 });

const Order = mongoose.model<IOrder>("Order", orderSchema);
export default Order;
