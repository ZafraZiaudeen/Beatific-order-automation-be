import { parseSpreadsheetBuffer, normalizeHeader, SpreadsheetRow } from "../infrastructure/spreadsheet";
import Order from "../infrastructure/schemas/Order";
import Product from "../infrastructure/schemas/Product";
import OrderEvent from "../infrastructure/schemas/OrderEvent";
import { notifySlack } from "../infrastructure/slack";
import { createNotification } from "./notification";
import { reviewOrderPersonalization, matchVariantWithAI } from "../infrastructure/openrouter";

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
  "channel order id": "etsyOrderId",
  "receipt id": "etsyReceiptId",
  "channel item id": "etsyItemId",  
  "item id": "etsyItemId",
  "sku": "sku",
  // Dates
  "sale date": "orderedAt",
  "order date": "orderedAt",
  "date paid": "orderedAt",
  // Product
  "item name": "productTitle",
  "item title": "productTitle",
  "listing id": "listingId",
  "quantity": "quantity",
  "price": "price",
  "shipping": "shippingCost",
  "ship by date": "shipByDate",
  "ship by": "shipByDate",
  // Customer
  "buyer": "customerName",
  "buyer name": "customerName",
  "full name": "customerName",
  "ship name": "shippingName",
  "ship to": "shippingName",
  "shipping first name": "shippingFirstName",
  "shipping last name": "shippingLastName",
  "email": "customerEmail",
  "buyer email": "customerEmail",
  "contact email": "customerEmail",
  "contact phone": "customerPhone",
  // Address
  "street 1": "street1",
  "street1": "street1",
  "address1": "street1",
  "ship address1": "street1",
  "shipping street1": "street1",
  "shipping street 1": "street1",
  "street 2": "street2",
  "street2": "street2",
  "address2": "street2",
  "ship address2": "street2",
  "shipping street2": "street2",
  "shipping street 2": "street2",
  "ship city": "city",
  "city": "city",
  "shipping city": "city",
  "ship state": "state",
  "state": "state",
  "shipping state": "state",
  "ship zip": "zip",
  "zip": "zip",
  "ship zipcode": "zip",
  "postal code": "zip",
  "shipping postal code": "zip",
  "ship country": "country",
  "country": "country",
  "shipping country": "country",
  // Personalization
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
      if (value) {
        mapped[mappedKey] = value;
      } else if (!(mappedKey in mapped)) {
        mapped[mappedKey] = "";
      }
    } else {
      mapped[`_raw_${normalized.replace(/\s+/g, "_")}`] = value;
    }
  }
  // Combine first+last name when channel export splits them
  if (!mapped.shippingName && (mapped.shippingFirstName || mapped.shippingLastName)) {
    mapped.shippingName = [mapped.shippingFirstName, mapped.shippingLastName].filter(Boolean).join(" ");
  }
  return mapped;
};

const splitInlineNumberedList = (text: string): string[] => {
  const parts = text.split(/ (?=\d+\. )/);
  if (parts.length < 2) return [];
  return parts.map((p) => p.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
};

const parsePersonalization = (raw: string): Record<string, string> => {
  if (!raw) return {};
  const result: Record<string, string> = {};
  const topLevelEntries = raw.split(/,(?=[A-Za-z\/][^:\n]{0,80}:)/);

  for (const entry of topLevelEntries) {
    const colonIdx = entry.indexOf(":");
    if (colonIdx <= 0) {
      if (entry.trim()) result[`note_${Object.keys(result).length}`] = entry.trim();
      continue;
    }

    const key = entry.slice(0, colonIdx).trim();
    const value = entry.slice(colonIdx + 1).trim();
    if (!key) continue;

    // Personalization block: expand numbered sub-items
    if (/personali[sz]ation/i.test(key)) {
      let lines = value.split(/\n+/).map((l) => l.trim()).filter(Boolean);

      // No newlines → try inline numbered list "1. X 2. Y 3. Z"
      if (lines.length === 1) {
        const inlineItems = splitInlineNumberedList(value);
        if (inlineItems.length > 1) lines = inlineItems;
      } else {
        // Newline-separated: strip leading "N." or "N)" prefix from each line
        lines = lines.map((l) => l.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean);
      }

      for (const line of lines) {
        const subColonIdx = line.indexOf(":");
        if (subColonIdx > 0) {
          const subKey = line.slice(0, subColonIdx).trim();
          const subVal = line.slice(subColonIdx + 1).trim();
          if (subKey && subVal) result[subKey] = subVal;
        } else if (line) {
          result[`item_${Object.keys(result).length + 1}`] = line;
        }
      }
    } else {
      result[key] = value;
    }
  }

  return result;
};

type ProductVariant = { name: string; podPackageId: string; interiorPdfUrl: string };

const matchProductVariant = async (
  variants: ProductVariant[],
  personalization: Record<string, string>,
  productTitle: string
): Promise<ProductVariant | null> => {
  if (!variants || variants.length === 0) return null;
  if (variants.length === 1) return variants[0];

  const variationText = Object.entries(personalization)
    .filter(([k]) => !/^(item_|note_)/.test(k))
    .map(([, v]) => v)
    .join(" ");

  if (!variationText.trim()) return null;

  const vLower = variationText.toLowerCase();

  const substringMatch = variants.find(
    (v) => vLower.includes(v.name.toLowerCase()) || v.name.toLowerCase().includes(vLower)
  );
  if (substringMatch) return substringMatch;

  const tokenMatch = variants.find((v) => {
    const tokens = v.name.toLowerCase().split(/[\s\-\/,()]+/).filter((t) => t.length > 2);
    return tokens.length >= 2 && tokens.every((t) => vLower.includes(t));
  });
  if (tokenMatch) return tokenMatch;

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const idx = await matchVariantWithAI(variants.map((v) => v.name), variationText, productTitle);
      if (idx !== null && idx >= 0) return variants[idx];
    } catch {
      // no match
    }
  }

  return null;
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

  const products = await Product.find({ companyId }).lean();
  const productMap = new Map(products.map((p) => [p.listingId, p]));

  const aiEnabled = Boolean(process.env.OPENROUTER_API_KEY);

  for (let i = 0; i < rawRows.length; i++) {
    try {
      const mapped = mapRow(rawRows[i]);
      const etsyOrderId = mapped.etsyOrderId?.trim();
      const etsyItemId = mapped.etsyItemId?.trim() || undefined;

      if (!etsyOrderId) {
        result.errors.push(`Row ${i + 2}: Missing Order ID`);
        continue;
      }

      let personalization = parsePersonalization(
        mapped.personalization || mapped.variations || ""
      );

      const SKIP_FROM_PERSONALIZATION = new Set(["sku", "channel_item_id", "channel_order_id", "recipient_tag"]);
      for (const [key, value] of Object.entries(mapped)) {
        if (key.startsWith("_raw_") && value) {
          const fieldName = key.replace("_raw_", "");
          if (!SKIP_FROM_PERSONALIZATION.has(fieldName)) {
            personalization[fieldName] = value;
          }
        }
      }

      personalization = Object.fromEntries(
        Object.entries(personalization).sort(([a], [b]) => a.localeCompare(b))
      );

      const listingId = mapped.listingId;
      const product = listingId ? productMap.get(listingId) : null;
      const isProductMapped = Boolean(product);
      const productTitle = mapped.productTitle || product?.title || "Unknown Product";
      const quantity = parseInt(mapped.quantity, 10) || 1;

      const dupQuery = etsyItemId
        ? { etsyItemId, companyId }
        : {
            etsyOrderId,
            companyId,
            productTitle,
            listingId: listingId || null,
            sku: mapped.sku || null,
            quantity,
            personalization,
          };
      const existing = await Order.findOne(dupQuery);
      if (existing) {
        result.skipped++;
        continue;
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

      let resolvedInteriorUrl = product?.interiorPdfUrl || null;
      let resolvedPodPackageId = product?.podPackageId || null;
      let matchedVariantName: string | null = null;

      if (product && product.variants && product.variants.length > 0) {
        const matched = await matchProductVariant(
          product.variants as ProductVariant[],
          personalization,
          mapped.productTitle || product.title || ""
        );
        if (matched) {
          resolvedInteriorUrl = matched.interiorPdfUrl || resolvedInteriorUrl;
          resolvedPodPackageId = matched.podPackageId || resolvedPodPackageId;
          matchedVariantName = matched.name;
        }
      }

      const order = new Order({
        etsyOrderId,
        etsyItemId,
        etsyReceiptId: mapped.etsyReceiptId || null,
        sku: mapped.sku || null,
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
        productTitle,
        personalization,
        quantity,
        price: parseFloat(mapped.price) || 0,
        shippingCost: parseFloat(mapped.shippingCost) || 0,
        coverImageUrl: product?.coverImageUrl || null,
        interiorPdfUrl: resolvedInteriorUrl,
        podPackageId: resolvedPodPackageId,
        matchedVariantName,
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
