import Order from "../infrastructure/schemas/Order";
import OrderEvent from "../infrastructure/schemas/OrderEvent";
import { UpdateOrderStatusInput, UpdateOrderInput, BulkStatusUpdateInput, BulkDeleteOrdersInput } from "../domain/dtos/order";
import NotFoundError from "../domain/errors/not-found-error";
import ValidationError from "../domain/errors/validation-error";

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
