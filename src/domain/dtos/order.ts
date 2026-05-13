import { z } from "zod";

const nullableString = z.string().optional().nullable();
const optionalInteger = z.coerce.number().int().optional().nullable();
const optionalNumber = z.coerce.number().optional().nullable();

export const ingestPersonalizationFieldSchema = z.object({
  label: z.string().optional().default(""),
  value: z.string().optional().default(""),
});

export const ingestOrderSchema = z.object({
  companyId: z.string().min(1).optional(),
  source: z.string().optional().default("n8n"),
  storeId: nullableString,
  orderNumber: z.string().min(1, "orderNumber is required"),
  projectName: nullableString,
  suffix: nullableString,
  totalItemsInOrder: optionalInteger,
  itemIndexInOrder: optionalInteger,
  isFirstItem: z.coerce.boolean().optional().default(true),
  transactionId: nullableString,
  listingId: nullableString,
  cleanTitle: nullableString,
  option1Name: nullableString,
  option1Value: nullableString,
  option2Name: nullableString,
  option2Value: nullableString,
  quantity: z.coerce.number().int().positive().optional().default(1),
  itemPrice: optionalNumber.default(0),
  personalization: z.array(ingestPersonalizationFieldSchema).optional().default([]),
  buyerNote: z.string().optional().default(""),
  shipBy: nullableString,
  paymentDate: nullableString,
  shop: nullableString,
  customer: z.object({
    name: nullableString,
    email: nullableString,
    address: z.object({
      street1: nullableString,
      street2: nullableString,
      city: nullableString,
      state: nullableString,
      zip: nullableString,
      country: nullableString,
    }).optional().default({}),
  }).optional().default({}),
  pricing: z.record(z.unknown()).optional().nullable(),
}).passthrough();

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "new",
    "custom_orders",
    "waiting",
    "drawings",
    "ready_to_order",
    "in_progress",
    "completed",
  ]),
  note: z.string().optional().default(""),
});

export const updateOrderSchema = z.object({
  coverImageUrl: z.string().url().optional().nullable(),
  interiorPdfUrl: z.string().url().optional().nullable(),
  podPackageId: z.string().optional().nullable(),
  notes: z.string().optional(),
  personalization: z.record(z.string()).optional(),
  templateFieldValues: z.record(z.string()).optional(),
  shippingLevel: z.string().optional(),
  matchedVariantId: z.string().optional().nullable(),
  matchedVariantName: z.string().optional().nullable(),
});

export const templateValuesSchema = z.object({
  values: z.record(z.string()).default({}),
});

export const bulkStatusUpdateSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1, "Select at least one order"),
  status: z.enum([
    "new",
    "custom_orders",
    "waiting",
    "drawings",
    "ready_to_order",
    "in_progress",
    "completed",
  ]),
  note: z.string().optional().default(""),
});

export const bulkDeleteOrdersSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1, "Select at least one order"),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type TemplateValuesInput = z.infer<typeof templateValuesSchema>;
export type BulkStatusUpdateInput = z.infer<typeof bulkStatusUpdateSchema>;
export type BulkDeleteOrdersInput = z.infer<typeof bulkDeleteOrdersSchema>;
export type IngestOrderInput = z.infer<typeof ingestOrderSchema>;
