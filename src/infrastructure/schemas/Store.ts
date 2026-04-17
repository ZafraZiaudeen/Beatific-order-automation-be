import mongoose, { Document, Schema } from "mongoose";

export interface IStore extends Document {
  name: string;
  companyId: mongoose.Types.ObjectId;
  etsyShopId: string | null;
  isActive: boolean;
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
  },
  { timestamps: true }
);

storeSchema.index({ companyId: 1 });
storeSchema.index({ name: 1, companyId: 1 }, { unique: true });

const Store = mongoose.model<IStore>("Store", storeSchema);
export default Store;
