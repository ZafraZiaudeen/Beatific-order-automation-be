import { z } from "zod";

export const createStoreSchema = z.object({
  name: z
    .string()
    .min(1, "Store name is required")
    .max(100, "Store name must be at most 100 characters")
    .trim(),
  etsyShopId: z.string().optional().nullable(),
  luluSandboxMode: z.boolean().optional(),
  shippingLevel: z.string().optional(),
  contactEmail: z.string().email("Must be a valid email").optional().nullable(),
});

export const updateStoreSchema = z.object({
  name: z
    .string()
    .min(1, "Store name is required")
    .max(100, "Store name must be at most 100 characters")
    .trim()
    .optional(),
  etsyShopId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  luluApiKey: z.string().optional().nullable(),
  luluApiSecret: z.string().optional().nullable(),
  luluApiBaseUrl: z.string().url("Must be a valid URL").optional().nullable(),
  luluSandboxMode: z.boolean().optional(),
  shippingLevel: z.string().optional(),
  contactEmail: z.string().email("Must be a valid email").optional().nullable(),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
