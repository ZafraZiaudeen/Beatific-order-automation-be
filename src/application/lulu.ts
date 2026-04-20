import Order from "../infrastructure/schemas/Order";
import OrderEvent from "../infrastructure/schemas/OrderEvent";
import { createPrintJob, getPrintJobStatus } from "../infrastructure/lulu";
import { notifySlack } from "../infrastructure/slack";
import { createNotification } from "./notification";
import ValidationError from "../domain/errors/validation-error";
import NotFoundError from "../domain/errors/not-found-error";

const LULU_STATUS_MAP: Record<string, string> = {
  CREATED: "submitted",
  UNPAID: "submitted",
  PAYMENT_IN_PROGRESS: "submitted",
  PRODUCTION_READY: "in_production",
  PRODUCTION_DELAYED: "in_production",
  IN_PRODUCTION: "in_production",
  SHIPPED: "shipped",
  CANCELED: "failed",
  REJECTED: "failed",
};

export const submitOrderToLulu = async (
  companyId: string,
  orderId: string,
  userId: string
) => {
  const order = await Order.findOne({ _id: orderId, companyId });
  if (!order) throw new NotFoundError("Order not found");

  if (order.etsyStatus !== "ready_to_order") {
    throw new ValidationError("Order must be in 'Ready to Order' status before submitting to Lulu");
  }
  if (!order.coverImageUrl) {
    throw new ValidationError("Cover image is required before submitting to Lulu");
  }
  if (!order.interiorPdfUrl) {
    throw new ValidationError("Interior PDF is required before submitting to Lulu");
  }
  if (!order.podPackageId) {
    throw new ValidationError("Pod Package ID is required before submitting to Lulu");
  }

  const luluResponse = await createPrintJob({
    externalId: order.etsyOrderId,
    title: order.productTitle,
    podPackageId: order.podPackageId,
    coverUrl: order.coverImageUrl,       // canonical URL, no transforms
    interiorUrl: order.interiorPdfUrl,   // canonical URL, no transforms
    quantity: order.quantity,
    shippingAddress: {
      name: order.shippingAddress.name,
      street1: order.shippingAddress.street1,
      street2: order.shippingAddress.street2,
      city: order.shippingAddress.city,
      state: order.shippingAddress.state,
      zip: order.shippingAddress.zip,
      country: order.shippingAddress.country,
    },
    contactEmail: order.customerEmail || "orders@beatific.co",
  });

  if (!luluResponse) {
    // Lulu not configured — update status as simulated
    order.etsyStatus = "in_progress";
    order.luluStatus = "submitted";
    order.luluJobId = `sim_${Date.now()}`;
    await order.save();

    await new OrderEvent({
      orderId: order._id,
      companyId,
      fromStatus: "ready_to_order",
      toStatus: "in_progress",
      statusType: "etsy",
      userId,
      note: "Simulated Lulu submission (Lulu not configured)",
    }).save();

    return order;
  }

  const fromStatus = order.etsyStatus;
  order.etsyStatus = "in_progress";
  order.luluStatus = "submitted";
  order.luluJobId = String(luluResponse.id);
  await order.save();

  await new OrderEvent({
    orderId: order._id,
    companyId,
    fromStatus,
    toStatus: "in_progress",
    statusType: "etsy",
    userId,
    note: `Submitted to Lulu (Job: ${luluResponse.id})`,
  }).save();

  await notifySlack("📤 Order Submitted to Lulu", [
    `Order: #${order.etsyOrderId}`,
    `Customer: ${order.customerName}`,
    `Product: ${order.productTitle}`,
    `Lulu Job ID: ${luluResponse.id}`,
  ]);

  await createNotification({
    companyId,
    type: "lulu_submitted",
    title: "Order Submitted to Lulu",
    message: `Order #${order.etsyOrderId} for ${order.customerName} was sent to Lulu Print (Job: ${luluResponse.id})`,
    orderId: String(order._id),
    link: "/orders/lulu",
  });

  return order;
};

export const bulkSubmitToLulu = async (
  companyId: string,
  orderIds: string[],
  userId: string
) => {
  const results = { submitted: 0, failed: 0, errors: [] as string[] };

  for (const orderId of orderIds) {
    try {
      await submitOrderToLulu(companyId, orderId, userId);
      results.submitted++;
    } catch (err) {
      results.failed++;
      results.errors.push(`Order ${orderId}: ${(err as Error).message}`);
    }
  }

  return results;
};

export const retryLuluSubmission = async (
  companyId: string,
  orderId: string,
  userId: string
) => {
  const order = await Order.findOne({ _id: orderId, companyId });
  if (!order) throw new NotFoundError("Order not found");

  // Reset to ready_to_order so submitOrderToLulu can run
  order.etsyStatus = "ready_to_order";
  order.luluStatus = null;
  order.luluJobId = null;
  await order.save();

  return submitOrderToLulu(companyId, orderId, userId);
};

export const refreshLuluStatus = async (companyId: string, orderId: string) => {
  const order = await Order.findOne({ _id: orderId, companyId });
  if (!order || !order.luluJobId) throw new NotFoundError("Order or Lulu Job ID not found");

  const status = await getPrintJobStatus(order.luluJobId);
  if (!status) return order;

  const luluStatusName = status.status?.name || "";
  const internalStatus = LULU_STATUS_MAP[luluStatusName] || order.luluStatus;

  if (internalStatus !== order.luluStatus) {
    order.luluStatus = internalStatus as "pending" | "submitted" | "in_production" | "shipped" | "failed";

    if (internalStatus === "shipped") {
      order.etsyStatus = "completed";
      const trackingNumbers = status.line_items?.[0]?.tracking_numbers;
      if (trackingNumbers?.length) {
        order.trackingNumber = trackingNumbers[0];
      }

      await notifySlack("🚚 Order Shipped!", [
        `Order: #${order.etsyOrderId}`,
        `Customer: ${order.customerName}`,
        `Tracking: ${order.trackingNumber || "N/A"}`,
      ]);

      await createNotification({
        companyId: String(order.companyId),
        type: "order_shipped",
        title: "Order Shipped",
        message: `Order #${order.etsyOrderId} for ${order.customerName} has shipped! Tracking: ${order.trackingNumber || "N/A"}`,
        orderId: String(order._id),
        link: "/orders/lulu",
      });
    }

    if (internalStatus === "failed") {
      order.etsyStatus = "waiting";
      order.aiFlags = [...(order.aiFlags || []), "Lulu Rejected"];

      await notifySlack("❌ Lulu Order Failed", [
        `Order: #${order.etsyOrderId}`,
        `Customer: ${order.customerName}`,
        `Status: ${luluStatusName}`,
      ]);

      await createNotification({
        companyId: String(order.companyId),
        type: "lulu_failed",
        title: "Lulu Order Failed",
        message: `Order #${order.etsyOrderId} was rejected by Lulu: ${luluStatusName}`,
        orderId: String(order._id),
        link: "/orders/lulu",
      });
    }

    await order.save();
  }

  return order;
};

export const pollLuluStatuses = async () => {
  const orders = await Order.find({
    luluStatus: { $in: ["submitted", "in_production"] },
    luluJobId: { $ne: null },
  }).lean();

  let updated = 0;

  for (const order of orders) {
    try {
      await refreshLuluStatus(String(order.companyId), String(order._id));
      updated++;
    } catch (err) {
      console.error(`[Cron] Failed to poll order ${order._id}:`, (err as Error).message);
    }
  }

  return { updated };
};
