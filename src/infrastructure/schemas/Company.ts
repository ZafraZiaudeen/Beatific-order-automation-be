import mongoose, { Document, Schema } from "mongoose";

export interface ICompany extends Document {
  name: string;
  ownerId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const companySchema = new Schema<ICompany>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

companySchema.index({ name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

const Company = mongoose.model<ICompany>("Company", companySchema);
export default Company;
