import mongoose from "mongoose";

const ensureOrderIndexes = async () => {
  try {
    const orders = mongoose.connection.collection("orders");
    const indexes = await orders.indexes();

    const etsyItemIdIndex = indexes.find((idx) => idx.name === "etsyItemId_1_companyId_1");
    const hasCorrectItemIdIndex = Boolean(
      etsyItemIdIndex?.unique &&
      etsyItemIdIndex.partialFilterExpression?.etsyItemId?.$gt === ""
    );

    if (!hasCorrectItemIdIndex) {
      if (etsyItemIdIndex) {
        await orders.dropIndex("etsyItemId_1_companyId_1");
      }
      await orders.createIndex(
        { etsyItemId: 1, companyId: 1 },
        {
          name: "etsyItemId_1_companyId_1",
          unique: true,
          partialFilterExpression: { etsyItemId: { $exists: true, $gt: "" } },
        }
      );
      console.log("Updated orders index etsyItemId_1_companyId_1 (partial unique, non-empty strings only)");
    }

    const etsyOrderIdIndex = indexes.find((idx) => idx.name === "etsyOrderId_1_companyId_1");
    if (etsyOrderIdIndex?.unique) {
      await orders.dropIndex("etsyOrderId_1_companyId_1");
      await orders.createIndex(
        { etsyOrderId: 1, companyId: 1 },
        { name: "etsyOrderId_1_companyId_1" }
      );
      console.log("Fixed orders index etsyOrderId_1_companyId_1 (removed unique constraint)");
    }
  } catch (error) {
    console.warn("Could not verify/update orders indexes", error);
  }
};

const connectDB = async () => {
  try {
    const MONGODB_URL = process.env.MONGODB_URL;

    if (!MONGODB_URL) {
      throw new Error("MONGODB_URL is missing in env");
    }

    await mongoose.connect(MONGODB_URL);
    await ensureOrderIndexes();
    console.log("Connected to MongoDB");
  } catch (error) {
    console.log("Error connecting to MongoDB", error);
  }
};

export default connectDB;
