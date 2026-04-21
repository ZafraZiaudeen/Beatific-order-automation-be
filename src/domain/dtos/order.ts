import { z } from "zod";

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
  shippingLevel: z.string().optional(),
  matchedVariantName: z.string().optional().nullable(),
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
export type BulkStatusUpdateInput = z.infer<typeof bulkStatusUpdateSchema>;
export type BulkDeleteOrdersInput = z.infer<typeof bulkDeleteOrdersSchema>;
