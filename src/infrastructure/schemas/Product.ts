import mongoose, { Document, Schema } from "mongoose";

export interface IProduct extends Document {
  listingId: string;
  companyId: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  title: string;
  coverImageUrl: string | null;
  interiorPdfUrl: string | null;
  podPackageId: string | null;
  variants: {
    name: string;
    podPackageId: string;
    interiorPdfUrl: string;
  }[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    listingId: {
      type: String,
      required: true,
      trim: true,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    coverImageUrl: {
      type: String,
      default: null,
    },
    interiorPdfUrl: {
      type: String,
      default: null,
    },
    podPackageId: {
      type: String,
      default: null,
      trim: true,
    },
    variants: [
      {
        name: { type: String, required: true },
        podPackageId: { type: String, required: true },
        interiorPdfUrl: { type: String, required: true },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

productSchema.index({ listingId: 1, companyId: 1 }, { unique: true });
productSchema.index({ companyId: 1, storeId: 1 });

const Product = mongoose.model<IProduct>("Product", productSchema);
export default Product;
