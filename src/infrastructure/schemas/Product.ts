import mongoose, { Document, Schema } from "mongoose";

export interface IProduct extends Document {
  listingId: string;
  companyId: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  title: string;
  coverImageUrl: string | null;
  interiorPdfUrl: string | null;
  podPackageId: string | null;
  variants: ProductVariant[];
  printTemplate?: PrintTemplate;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateTarget = "cover" | "interiorFirstPage";
export type TemplatePolicyValue = "inherit" | "override";

export interface ExtractedTemplateText {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  fill: string;
}

export interface PrintTemplatePage {
  sourcePdfUrl: string | null;
  previewImageUrl: string | null;
  pageWidth: number;
  pageHeight: number;
  pageCount: number;
  extractedText: ExtractedTemplateText[];
}

export interface PrintTemplateField {
  id: string;
  key: string;
  label: string;
  sampleValue: string;
  target: TemplateTarget;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  fontWeight?: number | null;
  fontFile?: string | null;
  fill: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  rotation?: number;
  required: boolean;
  replacementTextId?: string | null;
  replacementBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface PrintTemplate {
  cover?: PrintTemplatePage | null;
  interior?: PrintTemplatePage | null;
  fields: PrintTemplateField[];
  sampleOutputs?: {
    coverPdfUrl?: string | null;
    interiorPdfUrl?: string | null;
    coverPreviewUrl?: string | null;
    interiorPreviewUrl?: string | null;
    warnings?: string[];
    generatedAt?: Date | null;
  };
}

export interface ProductVariant {
  _id?: mongoose.Types.ObjectId | string;
  name: string;
  podPackageId?: string | null;
  interiorPdfUrl?: string | null;
  priceLabel?: string | null;
  templatePolicy?: {
    cover?: TemplatePolicyValue;
    interior?: TemplatePolicyValue;
    fields?: TemplatePolicyValue;
  };
  printTemplate?: PrintTemplate;
}

const extractedTemplateTextSchema = new Schema<ExtractedTemplateText>(
  {
    id: { type: String, required: true },
    text: { type: String, default: "" },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    fontSize: { type: Number, required: true },
    fontFamily: { type: String, default: "Arial" },
    fontStyle: { type: String, default: "normal" },
    fill: { type: String, default: "#000000" },
  },
  { _id: false }
);

const templatePolicySchema = new Schema(
  {
    cover: { type: String, enum: ["inherit", "override"], default: "inherit" },
    interior: { type: String, enum: ["inherit", "override"], default: "inherit" },
    fields: { type: String, enum: ["inherit", "override"], default: "inherit" },
  },
  { _id: false }
);

const printTemplatePageSchema = new Schema<PrintTemplatePage>(
  {
    sourcePdfUrl: { type: String, default: null },
    previewImageUrl: { type: String, default: null },
    pageWidth: { type: Number, default: 0 },
    pageHeight: { type: Number, default: 0 },
    pageCount: { type: Number, default: 0 },
    extractedText: { type: [extractedTemplateTextSchema], default: [] },
  },
  { _id: false }
);

const printTemplateFieldSchema = new Schema<PrintTemplateField>(
  {
    id: { type: String, required: true },
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    sampleValue: { type: String, default: "" },
    target: {
      type: String,
      enum: ["cover", "interiorFirstPage"],
      required: true,
    },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    fontSize: { type: Number, required: true },
    fontFamily: { type: String, default: "Arial" },
    fontStyle: { type: String, default: "normal" },
    fontWeight: { type: Number, default: 400 },
    fontFile: { type: String, default: null },
    fill: { type: String, default: "#000000" },
    align: { type: String, enum: ["left", "center", "right"], default: "left" },
    lineHeight: { type: Number, default: 1.2 },
    rotation: { type: Number, default: 0 },
    required: { type: Boolean, default: true },
    replacementTextId: { type: String, default: null },
    replacementBox: {
      type: {
        x: { type: Number, required: true },
        y: { type: Number, required: true },
        width: { type: Number, required: true },
        height: { type: Number, required: true },
      },
      default: null,
      _id: false,
    },
  },
  { _id: false }
);

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
        podPackageId: { type: String, default: null },
        interiorPdfUrl: { type: String, default: null },
        priceLabel: { type: String, default: null },
        templatePolicy: { type: templatePolicySchema, default: () => ({}) },
        printTemplate: {
          cover: { type: printTemplatePageSchema, default: null },
          interior: { type: printTemplatePageSchema, default: null },
          fields: { type: [printTemplateFieldSchema], default: [] },
          sampleOutputs: {
            coverPdfUrl: { type: String, default: null },
            interiorPdfUrl: { type: String, default: null },
            coverPreviewUrl: { type: String, default: null },
            interiorPreviewUrl: { type: String, default: null },
            warnings: { type: [String], default: [] },
            generatedAt: { type: Date, default: null },
          },
        },
      },
    ],
    printTemplate: {
      cover: { type: printTemplatePageSchema, default: null },
      interior: { type: printTemplatePageSchema, default: null },
      fields: { type: [printTemplateFieldSchema], default: [] },
      sampleOutputs: {
        coverPdfUrl: { type: String, default: null },
        interiorPdfUrl: { type: String, default: null },
        coverPreviewUrl: { type: String, default: null },
        interiorPreviewUrl: { type: String, default: null },
        warnings: { type: [String], default: [] },
        generatedAt: { type: Date, default: null },
      },
    },
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
