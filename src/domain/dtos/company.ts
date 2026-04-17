import { z } from "zod";

export const createStoreSchema = z.object({
  name: z
    .string()
    .min(1, "Store name is required")
    .max(100, "Store name must be at most 100 characters")
    .trim(),
  etsyShopId: z.string().optional().nullable(),
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
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
