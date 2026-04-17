import Store from "../infrastructure/schemas/Store";
import Company from "../infrastructure/schemas/Company";
import { CreateStoreInput, UpdateStoreInput } from "../domain/dtos/company";
import ConflictError from "../domain/errors/conflict-error";
import NotFoundError from "../domain/errors/not-found-error";

export const getCompanyInfo = async (companyId: string) => {
  const company = await Company.findById(companyId).lean();
  if (!company) throw new NotFoundError("Company not found");
  return company;
};

export const getStores = async (companyId: string) => {
  return Store.find({ companyId }).sort({ createdAt: 1 }).lean();
};

export const createStore = async (companyId: string, input: CreateStoreInput) => {
  const existing = await Store.findOne({
    name: { $regex: new RegExp(`^${input.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    companyId,
  });

  if (existing) {
    throw new ConflictError("A store with this name already exists");
  }

  const store = new Store({
    name: input.name,
    companyId,
    etsyShopId: input.etsyShopId || null,
  });
  await store.save();
  return store;
};

export const updateStore = async (
  companyId: string,
  storeId: string,
  input: UpdateStoreInput
) => {
  const store = await Store.findOne({ _id: storeId, companyId });
  if (!store) throw new NotFoundError("Store not found");

  if (input.name !== undefined) {
    const existing = await Store.findOne({
      name: { $regex: new RegExp(`^${input.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      companyId,
      _id: { $ne: storeId },
    });
    if (existing) throw new ConflictError("A store with this name already exists");
    store.name = input.name;
  }

  if (input.etsyShopId !== undefined) store.etsyShopId = input.etsyShopId || null;
  if (input.isActive !== undefined) store.isActive = input.isActive;

  await store.save();
  return store;
};

export const deleteStore = async (companyId: string, storeId: string) => {
  const store = await Store.findOne({ _id: storeId, companyId });
  if (!store) throw new NotFoundError("Store not found");

  await Store.deleteOne({ _id: storeId });
  return { message: "Store deleted" };
};
