import Order from "../infrastructure/schemas/Order";
import OrderEvent from "../infrastructure/schemas/OrderEvent";
import Product, { ProductVariant } from "../infrastructure/schemas/Product";
import Store from "../infrastructure/schemas/Store";
import Company from "../infrastructure/schemas/Company";
import {
  UpdateOrderStatusInput,
  UpdateOrderInput,
  BulkStatusUpdateInput,
  BulkDeleteOrdersInput,
  IngestOrderInput,
} from "../domain/dtos/order";
import NotFoundError from "../domain/errors/not-found-error";
import ValidationError from "../domain/errors/validation-error";
import { productHasPrintTemplate, resolveEffectiveTemplate } from "./template";

const getReadyToOrderMissingFields = (order: {
  coverImageUrl?: string | null;
  interiorPdfUrl?: string | null;
  podPackageId?: string | null;
  requiresTemplateFinalization?: boolean;
  templateFinalizedAt?: Date | null;
}) => {
  const missing: string[] = [];
  if (order.requiresTemplateFinalization && !order.templateFinalizedAt) {
    missing.push("personalized print PDFs");
  }
  if (!order.coverImageUrl) missing.push("cover image");
  if (!order.interiorPdfUrl) missing.push("inside page PDF");
  if (!order.podPackageId) missing.push("Pod Package ID");
  return missing;
};

const assertReadyToOrderRequirements = (order: {
  coverImageUrl?: string | null;
  interiorPdfUrl?: string | null;
  podPackageId?: string | null;
}) => {
  const missing = getReadyToOrderMissingFields(order);
  if (missing.length > 0) {
    throw new ValidationError(`Cannot move to \"Ready to Order\". Missing: ${missing.join(", ")}.`);
  }
};

const normalizeString = (value?: string | null) => {
  const trimmed = String(value ?? "").trim();
  return trimmed || "";
};

const nullableStringValue = (value?: string | null) => normalizeString(value) || null;

const parseDate = (raw?: string | null, fallbackYear?: number | null): Date | null => {
  const value = normalizeString(raw);
  if (!value) return null;

  const withYear = /\b\d{4}\b/.test(value) || !fallbackYear
    ? value
    : `${value}, ${fallbackYear}`;
  const parsed = new Date(withYear);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addPersonalizationValue = (
  target: Record<string, string>,
  rawKey?: string | null,
  rawValue?: string | null
) => {
  const key = normalizeString(rawKey);
  const value = normalizeString(rawValue);
  if (!key || !value) return;

  let uniqueKey = key;
  let counter = 2;
  while (Object.prototype.hasOwnProperty.call(target, uniqueKey)) {
    uniqueKey = `${key} ${counter}`;
    counter++;
  }
  target[uniqueKey] = value;
};

const buildPersonalizationRecord = (input: IngestOrderInput) => {
  const personalization: Record<string, string> = {};
  addPersonalizationValue(personalization, input.option1Name || "Option 1", input.option1Value);
  addPersonalizationValue(personalization, input.option2Name || "Option 2", input.option2Value);

  for (const field of input.personalization || []) {
    addPersonalizationValue(personalization, field.label, field.value);
  }

  return Object.fromEntries(
    Object.entries(personalization).sort(([a], [b]) => a.localeCompare(b))
  );
};

const normalizeForMatch = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const matchIngestVariant = (
  variants: ProductVariant[] | undefined,
  input: IngestOrderInput,
  personalization: Record<string, string>
): ProductVariant | null => {
  if (!variants?.length) return null;
  if (variants.length === 1) return variants[0];

  const haystack = normalizeForMatch([
    input.option1Value,
    input.option2Value,
    input.cleanTitle,
    ...Object.values(personalization),
  ].filter(Boolean).join(" "));

  if (!haystack) return null;
  return variants.find((variant) => {
    const name = normalizeForMatch(variant.name || "");
    if (!name) return false;
    return haystack.includes(name) || name.includes(haystack);
  }) || null;
};

const getVariantId = (variant: ProductVariant | null) => {
  const raw = (variant as { _id?: unknown } | null)?._id;
  return raw ? String(raw) : null;
};

const buildTemplateSeedValues = (
  fields: Array<{ key: string; label: string; sampleValue?: string }>,
  personalization: Record<string, string>,
  input: IngestOrderInput
) => {
  const values: Record<string, string> = {};
  const entries = Object.entries(personalization);

  for (const field of fields) {
    const keyMatch = entries.find(([key]) => normalizeForMatch(key) === normalizeForMatch(field.key));
    const labelMatch = entries.find(([key]) => normalizeForMatch(key) === normalizeForMatch(field.label));
    const looseMatch = entries.find(([key]) => {
      const normalizedKey = normalizeForMatch(key);
      return (
        normalizedKey.includes(normalizeForMatch(field.key)) ||
        normalizedKey.includes(normalizeForMatch(field.label))
      );
    });

    values[field.key] =
      keyMatch?.[1] ||
      labelMatch?.[1] ||
      looseMatch?.[1] ||
      (normalizeForMatch(field.key).includes("name") ? normalizeString(input.customer?.name) : "") ||
      field.sampleValue ||
      "";
  }

  return values;
};

const resolveIngestStore = async (companyId: string, input: IngestOrderInput) => {
  const storeId = normalizeString(input.storeId);
  if (storeId) {
    const store = await Store.findOne({ _id: storeId, companyId });
    if (!store) throw new ValidationError("Store ID does not belong to this company");
    return store;
  }

  const storeName = (normalizeString(input.shop) || "Etsy").slice(0, 100);
  return Store.findOneAndUpdate(
    { companyId, name: storeName },
    {
      $setOnInsert: {
        companyId,
        name: storeName,
        etsyShopId: normalizeString(input.shop) || null,
        isActive: true,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

export const ingestOrderFromN8n = async (
  companyId: string,
  input: IngestOrderInput
) => {
  const company = await Company.findById(companyId).lean();
  if (!company) throw new ValidationError("Company not found for n8n ingest");

  const store = await resolveIngestStore(companyId, input);
  const personalization = buildPersonalizationRecord(input);
  const product = normalizeString(input.listingId)
    ? await Product.findOne({ listingId: normalizeString(input.listingId), companyId }).lean()
    : null;
  const matchedVariant = product
    ? matchIngestVariant(product.variants as ProductVariant[] | undefined, input, personalization)
    : null;
  const matchedVariantId = getVariantId(matchedVariant);
  const matchedVariantName = matchedVariant?.name || null;
  const variantKey = matchedVariantId || matchedVariantName;
  const requiresTemplateFinalization = Boolean(product && productHasPrintTemplate(product, variantKey));
  const template = product && requiresTemplateFinalization
    ? resolveEffectiveTemplate(product, variantKey).template
    : null;
  const templateSeedValues = template?.fields?.length
    ? buildTemplateSeedValues(template.fields, personalization, input)
    : {};

  const orderedAt = parseDate(input.paymentDate);
  const shipByDate = parseDate(
    input.shipBy,
    orderedAt?.getUTCFullYear() || new Date().getUTCFullYear()
  );
  const productTitle =
    normalizeString(input.cleanTitle) ||
    normalizeString(product?.title) ||
    "Unknown Product";
  const customerName = normalizeString(input.customer?.name) || "Unknown";
  const etsyItemId =
    normalizeString(input.transactionId) ||
    normalizeString(input.projectName) ||
    `${normalizeString(input.orderNumber)}:${input.itemIndexInOrder ?? 0}`;
  const isProductMapped = Boolean(product);
  const initialStatus = isProductMapped ? "new" : "waiting";

  const orderFields = {
    etsyOrderId: normalizeString(input.orderNumber),
    etsyItemId,
    etsyReceiptId: null,
    sku: null,
    companyId,
    storeId: store._id,
    productId: product?._id || null,
    listingId: nullableStringValue(input.listingId),
    ingestSource: normalizeString(input.source) || "n8n",
    projectName: nullableStringValue(input.projectName),
    suffix: nullableStringValue(input.suffix),
    totalItemsInOrder: input.totalItemsInOrder ?? null,
    itemIndexInOrder: input.itemIndexInOrder ?? null,
    isFirstItem: input.isFirstItem ?? true,
    shop: nullableStringValue(input.shop),
    option1Name: nullableStringValue(input.option1Name),
    option1Value: nullableStringValue(input.option1Value),
    option2Name: nullableStringValue(input.option2Name),
    option2Value: nullableStringValue(input.option2Value),
    buyerNote: nullableStringValue(input.buyerNote),
    pricing: input.pricing || null,
    rawIngestPayload: input as Record<string, unknown>,
    customerName,
    customerEmail: nullableStringValue(input.customer?.email),
    shippingAddress: {
      name: customerName,
      street1: normalizeString(input.customer?.address?.street1),
      street2: normalizeString(input.customer?.address?.street2),
      city: normalizeString(input.customer?.address?.city),
      state: normalizeString(input.customer?.address?.state),
      zip: normalizeString(input.customer?.address?.zip),
      country: normalizeString(input.customer?.address?.country),
    },
    productTitle,
    personalization,
    quantity: input.quantity || 1,
    price: Number(input.itemPrice || 0),
    shippingCost: Number(input.pricing?.shipping || 0),
    coverImageUrl: requiresTemplateFinalization ? null : product?.coverImageUrl || null,
    interiorPdfUrl: requiresTemplateFinalization
      ? null
      : matchedVariant?.interiorPdfUrl || product?.interiorPdfUrl || null,
    podPackageId: matchedVariant?.podPackageId || product?.podPackageId || null,
    shippingLevel: store.shippingLevel || "MAIL",
    shipByDate,
    orderedAt,
    matchedVariantId,
    matchedVariantName,
    requiresTemplateFinalization,
    templateAiSuggestions: templateSeedValues,
    templateFieldValues: templateSeedValues,
    notes: normalizeString(input.buyerNote),
    isProductMapped,
    aiFlags: isProductMapped ? [] : ["Missing Product Mapping"],
  };

  const existing = await Order.findOne({ etsyItemId, companyId });
  if (existing) {
    const previousStatus = existing.etsyStatus;
    Object.assign(existing, orderFields);
    existing.etsyStatus = previousStatus;
    await existing.save();

    return {
      created: false,
      updated: true,
      orderId: existing._id,
      etsyOrderId: existing.etsyOrderId,
      etsyItemId: existing.etsyItemId,
      isProductMapped: existing.isProductMapped,
    };
  }

  const order = new Order({
    ...orderFields,
    etsyStatus: initialStatus,
  });
  await order.save();

  await new OrderEvent({
    orderId: order._id,
    companyId,
    fromStatus: null,
    toStatus: order.etsyStatus,
    statusType: "etsy",
    userId: null,
    note: `Ingested from ${order.ingestSource || "n8n"}`,
  }).save();

  return {
    created: true,
    updated: false,
    orderId: order._id,
    etsyOrderId: order.etsyOrderId,
    etsyItemId: order.etsyItemId,
    isProductMapped: order.isProductMapped,
  };
};

export const getOrders = async (
  companyId: string,
  filters: {
    storeId?: string;
    etsyStatus?: string;
    luluStatus?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }
) => {
  const query: Record<string, unknown> = { companyId };
  if (filters.storeId) query.storeId = filters.storeId;
  if (filters.etsyStatus) query.etsyStatus = filters.etsyStatus;
  if (filters.luluStatus) query.luluStatus = filters.luluStatus;
  if (filters.search) {
    query.$or = [
      { etsyOrderId: { $regex: filters.search, $options: "i" } },
      { customerName: { $regex: filters.search, $options: "i" } },
      { productTitle: { $regex: filters.search, $options: "i" } },
    ];
  }
  applyOrderedAtDateRange(query, filters.dateFrom, filters.dateTo);

  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 50));
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find(query).sort({ shipByDate: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(query),
  ]);

  return { orders, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getOrderById = async (companyId: string, orderId: string) => {
  const order = await Order.findOne({ _id: orderId, companyId }).lean();
  if (!order) throw new NotFoundError("Order not found");
  return order;
};

export const getOrderEvents = async (orderId: string) => {
  return OrderEvent.find({ orderId })
    .sort({ createdAt: -1 })
    .populate("userId", "name email")
    .lean();
};

export const getOrderStatusCounts = async (
  companyId: string,
  storeId?: string,
  dateFrom?: string,
  dateTo?: string
) => {
  const match: Record<string, unknown> = { companyId };
  if (storeId) match.storeId = storeId;
  applyOrderedAtDateRange(match, dateFrom, dateTo);

  const counts = await Order.aggregate([
    { $match: match },
    { $group: { _id: "$etsyStatus", count: { $sum: 1 } } },
  ]);

  const result: Record<string, number> = {};
  for (const c of counts) {
    result[c._id] = c.count;
  }
  return result;
};

const applyOrderedAtDateRange = (
  query: Record<string, unknown>,
  dateFrom?: string,
  dateTo?: string
) => {
  const orderedAtRange: Record<string, Date> = {};

  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    if (Number.isNaN(fromDate.getTime())) {
      throw new ValidationError("Invalid dateFrom value");
    }
    orderedAtRange.$gte = fromDate;
  }

  if (dateTo) {
    const toDate = new Date(dateTo);
    if (Number.isNaN(toDate.getTime())) {
      throw new ValidationError("Invalid dateTo value");
    }
    orderedAtRange.$lte = toDate;
  }

  if (orderedAtRange.$gte && orderedAtRange.$lte && orderedAtRange.$gte > orderedAtRange.$lte) {
    throw new ValidationError("dateFrom must be before or equal to dateTo");
  }

  if (Object.keys(orderedAtRange).length > 0) {
    query.orderedAt = orderedAtRange;
  }
};

export const updateOrderStatus = async (
  companyId: string,
  orderId: string,
  userId: string,
  input: UpdateOrderStatusInput
) => {
  const order = await Order.findOne({ _id: orderId, companyId });
  if (!order) throw new NotFoundError("Order not found");

  if (input.status === "ready_to_order") {
    assertReadyToOrderRequirements(order);
  }

  const fromStatus = order.etsyStatus;
  order.etsyStatus = input.status;
  await order.save();

  // Log the event
  await new OrderEvent({
    orderId,
    companyId,
    fromStatus,
    toStatus: input.status,
    statusType: "etsy",
    userId,
    note: input.note || "",
  }).save();

  return order;
};

export const updateOrder = async (
  companyId: string,
  orderId: string,
  input: UpdateOrderInput
) => {
  const order = await Order.findOne({ _id: orderId, companyId });
  if (!order) throw new NotFoundError("Order not found");

  if (input.coverImageUrl !== undefined) order.coverImageUrl = input.coverImageUrl || null;
  if (input.interiorPdfUrl !== undefined) order.interiorPdfUrl = input.interiorPdfUrl || null;
  if (input.podPackageId !== undefined) order.podPackageId = input.podPackageId || null;
  if (input.notes !== undefined) order.notes = input.notes;
  if (input.personalization !== undefined) order.personalization = input.personalization;
  if (input.templateFieldValues !== undefined) order.templateFieldValues = input.templateFieldValues;
  if (input.shippingLevel !== undefined) order.shippingLevel = input.shippingLevel;
  if (input.matchedVariantId !== undefined) order.matchedVariantId = input.matchedVariantId || null;
  if (input.matchedVariantName !== undefined) order.matchedVariantName = input.matchedVariantName || null;

  // Check if has custom artwork
  if (order.coverImageUrl) order.hasCustomArtwork = true;

  await order.save();
  return order;
};

export const bulkUpdateStatus = async (
  companyId: string,
  userId: string,
  input: BulkStatusUpdateInput
) => {
  const orders = await Order.find({ _id: { $in: input.orderIds }, companyId });
  if (orders.length === 0) throw new NotFoundError("No orders found");

  if (input.status === "ready_to_order") {
    const invalidOrders = orders
      .map((order) => {
        const missing = getReadyToOrderMissingFields(order);
        if (missing.length === 0) return null;
        return `#${order.etsyOrderId}: ${missing.join(", ")}`;
      })
      .filter((item): item is string => Boolean(item));

    if (invalidOrders.length > 0) {
      throw new ValidationError(
        `Cannot move selected orders to \"Ready to Order\". Missing fields -> ${invalidOrders.join("; ")}`
      );
    }
  }

  const events: Array<{
    orderId: unknown;
    companyId: string;
    fromStatus: string;
    toStatus: string;
    statusType: string;
    userId: string;
    note: string;
  }> = [];

  for (const order of orders) {
    const fromStatus = order.etsyStatus;
    order.etsyStatus = input.status;
    await order.save();
    events.push({
      orderId: order._id,
      companyId,
      fromStatus,
      toStatus: input.status,
      statusType: "etsy",
      userId,
      note: input.note || "Bulk status update",
    });
  }

  await OrderEvent.insertMany(events);
  return { updated: orders.length };
};

export const bulkDeleteOrders = async (
  companyId: string,
  input: BulkDeleteOrdersInput
) => {
  const result = await Order.deleteMany({
    _id: { $in: input.orderIds },
    companyId,
  });

  if (result.deletedCount === 0) {
    throw new NotFoundError("No orders found");
  }

  await OrderEvent.deleteMany({
    orderId: { $in: input.orderIds },
    companyId,
  });

  return { deleted: result.deletedCount };
};
