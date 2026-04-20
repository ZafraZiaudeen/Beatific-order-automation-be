import { z } from "zod";

export const createProductSchema = z.object({
  listingId: z.string().min(1, "Listing ID is required").trim(),
  storeId: z.string().min(1, "Store ID is required"),
  title: z.string().min(1, "Title is required").max(300).trim(),
  coverImageUrl: z.string().url().optional().nullable(),
  interiorPdfUrl: z.string().url().optional().nullable(),
  podPackageId: z.string().optional().nullable(),
  variants: z
    .array(
      z.object({
        name: z.string().min(1),
        podPackageId: z.string().min(1),
        interiorPdfUrl: z.string().url(),
      })
    )
    .optional()
    .default([]),
});

export const updateProductSchema = z.object({
  title: z.string().min(1).max(300).trim().optional(),
  coverImageUrl: z.string().url().optional().nullable(),
  interiorPdfUrl: z.string().url().optional().nullable(),
  podPackageId: z.string().optional().nullable(),
  variants: z
    .array(
      z.object({
        name: z.string().min(1),
        podPackageId: z.string().min(1),
        interiorPdfUrl: z.string().url(),
      })
    )
    .optional(),
  isActive: z.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
