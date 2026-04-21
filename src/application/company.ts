import Store from "../infrastructure/schemas/Store";
import Company from "../infrastructure/schemas/Company";
import { CreateStoreInput, UpdateStoreInput } from "../domain/dtos/company";
import ConflictError from "../domain/errors/conflict-error";
import NotFoundError from "../domain/errors/not-found-error";
import ValidationError from "../domain/errors/validation-error";
import { encryptLuluCredential, hasLuluCredentialEncryptionKey } from "../infrastructure/lulu-credentials";

const sanitizeStoreForResponse = (storeLike: { toObject?: () => Record<string, unknown> } | Record<string, unknown>) => {
  const rawRecord =
    typeof (storeLike as { toObject?: () => Record<string, unknown> }).toObject === "function"
      ? (storeLike as { toObject: () => Record<string, unknown> }).toObject()
      : storeLike;
  const raw = rawRecord as Record<string, unknown>;

  return {
    ...raw,
    luluApiKey: null,
    luluApiSecret: null,
    luluApiKeyConfigured: Boolean(raw.luluApiKey),
    luluApiSecretConfigured: Boolean(raw.luluApiSecret),
  };
};

export const getCompanyInfo = async (companyId: string) => {
  const company = await Company.findById(companyId).lean();
  if (!company) throw new NotFoundError("Company not found");
  return company;
};

export const getStores = async (companyId: string) => {
  const stores = await Store.find({ companyId }).sort({ createdAt: 1 }).lean();
  return stores.map((store) => sanitizeStoreForResponse(store));
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
    luluSandboxMode: input.luluSandboxMode ?? true,
    shippingLevel: input.shippingLevel || "MAIL",
    contactEmail: input.contactEmail || null,
  });
  await store.save();
  return sanitizeStoreForResponse(store);
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
  if ((input.luluApiKey !== undefined || input.luluApiSecret !== undefined) && !hasLuluCredentialEncryptionKey()) {
    throw new ValidationError(
      "Set LULU_CREDENTIALS_ENCRYPTION_KEY in backend .env before saving Lulu API credentials."
    );
  }
  if (input.luluApiKey !== undefined) store.luluApiKey = encryptLuluCredential(input.luluApiKey);
  if (input.luluApiSecret !== undefined) store.luluApiSecret = encryptLuluCredential(input.luluApiSecret);
  if (input.luluApiBaseUrl !== undefined) store.luluApiBaseUrl = input.luluApiBaseUrl || null;
  if (input.luluSandboxMode !== undefined) store.luluSandboxMode = input.luluSandboxMode;
  if (input.shippingLevel !== undefined) store.shippingLevel = input.shippingLevel;
  if (input.contactEmail !== undefined) store.contactEmail = input.contactEmail || null;

  await store.save();
  return sanitizeStoreForResponse(store);
};

export const deleteStore = async (companyId: string, storeId: string) => {
  const store = await Store.findOne({ _id: storeId, companyId });
  if (!store) throw new NotFoundError("Store not found");

  await Store.deleteOne({ _id: storeId });
  return { message: "Store deleted" };
};
