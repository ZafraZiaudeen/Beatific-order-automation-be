import { parseSpreadsheetBuffer, normalizeHeader, SpreadsheetRow } from "../infrastructure/spreadsheet";
import Order from "../infrastructure/schemas/Order";
import Product from "../infrastructure/schemas/Product";
import OrderEvent from "../infrastructure/schemas/OrderEvent";
import { notifySlack } from "../infrastructure/slack";
import { createNotification } from "./notification";
import { reviewOrderPersonalization } from "../infrastructure/openrouter";

type ImportResult = {
  total: number;
  created: number;
  skipped: number;
  unmapped: number;
  errors: string[];
  orders: Array<{
    etsyOrderId: string;
    status: string;
    isProductMapped: boolean;
    productTitle: string;
  }>;
};

// Common Etsy export column header mappings
const HEADER_MAP: Record<string, string> = {
  "order id": "etsyOrderId",
  "receipt id": "etsyReceiptId",
  "sale date": "orderedAt",
  "order date": "orderedAt",
  "date paid": "orderedAt",
  "item name": "productTitle",
  "item title": "productTitle",
  "listing id": "listingId",
  "quantity": "quantity",
  "price": "price",
  "shipping": "shippingCost",
  "ship by date": "shipByDate",
  "ship by": "shipByDate",
  "buyer": "customerName",
  "buyer name": "customerName",
  "full name": "customerName",
  "ship name": "shippingName",
  "ship to": "shippingName",
  "email": "customerEmail",
  "buyer email": "customerEmail",
  "street 1": "street1",
  "street1": "street1",
  "address1": "street1",
  "ship address1": "street1",
  "street 2": "street2",
  "street2": "street2",
  "address2": "street2",
  "ship address2": "street2",
  "ship city": "city",
  "city": "city",
  "ship state": "state",
  "state": "state",
  "ship zip": "zip",
  "zip": "zip",
  "ship zipcode": "zip",
  "ship country": "country",
  "country": "country",
  "variations": "variations",
  "personalizations": "personalization",
  "personalization": "personalization",
  "order notes": "notes",
  "gift message": "giftMessage",
};

const mapRow = (row: SpreadsheetRow): Record<string, string> => {
  const mapped: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(row)) {
    const normalized = normalizeHeader(rawKey);
    const mappedKey = HEADER_MAP[normalized];
    if (mappedKey) {
      mapped[mappedKey] = value;
    } else {
      mapped[`_raw_${normalized.replace(/\s+/g, "_")}`] = value;
    }
  }
  return mapped;
};

const parsePersonalization = (raw: string): Record<string, string> => {
  if (!raw) return {};
  const result: Record<string, string> = {};
  const lines = raw.split(/[\n;]/).filter(Boolean);
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (key && val) result[key] = val;
    } else {
      result[`note_${Object.keys(result).length}`] = line.trim();
    }
  }
  return result;
};

const parseDate = (raw: string): Date | null => {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

export const importSpreadsheet = async (
  buffer: Buffer,
  filename: string,
  companyId: string,
  storeId: string,
  userId: string
): Promise<ImportResult> => {
  const rawRows = parseSpreadsheetBuffer(buffer, filename);
  const result: ImportResult = {
    total: rawRows.length,
    created: 0,
    skipped: 0,
    unmapped: 0,
    errors: [],
    orders: [],
  };

  // Load all products for this company to match listing IDs
  const products = await Product.find({ companyId }).lean();
  const productMap = new Map(products.map((p) => [p.listingId, p]));

  const aiEnabled = Boolean(process.env.OPENROUTER_API_KEY);

  for (let i = 0; i < rawRows.length; i++) {
    try {
      const mapped = mapRow(rawRows[i]);
      const etsyOrderId = mapped.etsyOrderId;

      if (!etsyOrderId) {
        result.errors.push(`Row ${i + 2}: Missing Order ID`);
        continue;
      }

      // Skip duplicates
      const existing = await Order.findOne({ etsyOrderId, companyId });
      if (existing) {
        result.skipped++;
        continue;
      }

      // Match product
      const listingId = mapped.listingId;
      const product = listingId ? productMap.get(listingId) : null;
      const isProductMapped = Boolean(product);

      // Parse personalization
      const personalization = parsePersonalization(
        mapped.personalization || mapped.variations || ""
      );

      // Collect raw fields as additional personalization
      for (const [key, value] of Object.entries(mapped)) {
        if (key.startsWith("_raw_") && value) {
          personalization[key.replace("_raw_", "")] = value;
        }
      }

      // AI Review
      let aiFlags: string[] = isProductMapped ? [] : ["Missing Product Mapping"];
      let etsyStatus: string = isProductMapped ? "new" : "waiting";

      if (aiEnabled && isProductMapped && Object.keys(personalization).length > 0) {
        try {
          const aiResult = await reviewOrderPersonalization(
            personalization,
            mapped.productTitle || product?.title || ""
          );
          if (!aiResult.isClean && aiResult.flags.length > 0) {
            aiFlags = [...aiFlags, ...aiResult.flags];
            etsyStatus = "waiting";
          }
        } catch {
          aiFlags.push("AI review skipped");
        }
      }

      const order = new Order({
        etsyOrderId,
        etsyReceiptId: mapped.etsyReceiptId || null,
        companyId,
        storeId,
        productId: product?._id || null,
        listingId: listingId || null,
        etsyStatus,
        customerName: mapped.customerName || mapped.shippingName || "Unknown",
        customerEmail: mapped.customerEmail || null,
        shippingAddress: {
          name: mapped.shippingName || mapped.customerName || "",
          street1: mapped.street1 || "",
          street2: mapped.street2 || "",
          city: mapped.city || "",
          state: mapped.state || "",
          zip: mapped.zip || "",
          country: mapped.country || "",
        },
        productTitle: mapped.productTitle || product?.title || "Unknown Product",
        personalization,
        quantity: parseInt(mapped.quantity, 10) || 1,
        price: parseFloat(mapped.price) || 0,
        shippingCost: parseFloat(mapped.shippingCost) || 0,
        coverImageUrl: product?.coverImageUrl || null,
        interiorPdfUrl: product?.interiorPdfUrl || null,
        podPackageId: product?.podPackageId || null,
        shipByDate: parseDate(mapped.shipByDate),
        orderedAt: parseDate(mapped.orderedAt),
        notes: mapped.notes || mapped.giftMessage || "",
        isProductMapped,
        aiFlags,
      });

      await order.save();

      // Create initial event
      await new OrderEvent({
        orderId: order._id,
        companyId,
        fromStatus: null,
        toStatus: order.etsyStatus,
        statusType: "etsy",
        userId,
        note: `Imported from ${filename}`,
      }).save();

      result.created++;
      if (!isProductMapped) result.unmapped++;

      result.orders.push({
        etsyOrderId,
        status: order.etsyStatus,
        isProductMapped,
        productTitle: order.productTitle,
      });
    } catch (err) {
      result.errors.push(`Row ${i + 2}: ${(err as Error).message}`);
    }
  }

  // Slack notification
  if (result.created > 0) {
    await notifySlack(`📦 Import Complete — ${filename}`, [
      `Created: ${result.created} orders`,
      `Skipped (duplicates): ${result.skipped}`,
      `Unmapped listings: ${result.unmapped}`,
      result.errors.length > 0 ? `Errors: ${result.errors.length}` : "",
    ].filter(Boolean));

    // In-app notification
    // companyId and userId come from function params
    try {
      await createNotification({
        companyId,
        type: "import_complete",
        title: "Import Complete",
        message: `${result.created} orders imported from ${filename}${result.unmapped > 0 ? ` (${result.unmapped} unmapped)` : ""}`,
        link: "/orders/etsy",
      });
    } catch {
      // ignore notification errors
    }
  }

  return result;
};
