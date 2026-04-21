import mongoose, { Document, Schema } from "mongoose";

export interface IStore extends Document {
  name: string;
  companyId: mongoose.Types.ObjectId;
  etsyShopId: string | null;
  isActive: boolean;

  // Lulu Print API settings (per-store, optional — falls back to env vars)
  luluApiKey: string | null;
  luluApiSecret: string | null;
  luluApiBaseUrl: string | null;
  luluSandboxMode: boolean;
  shippingLevel: string;
  contactEmail: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const storeSchema = new Schema<IStore>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    etsyShopId: {
      type: String,
      default: null,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Lulu settings
    luluApiKey: { type: String, default: null, trim: true },
    luluApiSecret: { type: String, default: null, trim: true },
    luluApiBaseUrl: { type: String, default: null, trim: true },
    luluSandboxMode: { type: Boolean, default: true },
    shippingLevel: { type: String, default: "MAIL", trim: true },
    contactEmail: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

storeSchema.index({ companyId: 1 });
storeSchema.index({ name: 1, companyId: 1 }, { unique: true });

const Store = mongoose.model<IStore>("Store", storeSchema);
export default Store;
