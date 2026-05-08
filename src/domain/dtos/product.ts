import { z } from "zod";

const extractedTemplateTextSchema = z.object({
  id: z.string().min(1),
  text: z.string().default(""),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  fontSize: z.number(),
  fontFamily: z.string().default("Arial"),
  fontStyle: z.string().default("normal"),
  fill: z.string().default("#000000"),
});

const printTemplatePageSchema = z
  .object({
    sourcePdfUrl: z.string().url().nullable().optional(),
    previewImageUrl: z.string().url().nullable().optional(),
    pageWidth: z.number().nonnegative().default(0),
    pageHeight: z.number().nonnegative().default(0),
    pageCount: z.number().int().nonnegative().default(0),
    extractedText: z.array(extractedTemplateTextSchema).default([]),
  })
  .nullable();

const printTemplateFieldSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1).trim(),
  label: z.string().min(1).trim(),
  sampleValue: z.string().default(""),
  target: z.enum(["cover", "interiorFirstPage"]),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fontSize: z.number().positive(),
  fontFamily: z.string().default("Arial"),
  fontStyle: z.string().default("normal"),
  fill: z.string().default("#000000"),
  align: z.enum(["left", "center", "right"]).default("left"),
  lineHeight: z.number().positive().default(1.2),
  required: z.boolean().default(true),
  replacementTextId: z.string().optional().nullable(),
  replacementBox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional()
    .nullable(),
});

export const printTemplateSchema = z.object({
  cover: printTemplatePageSchema.optional(),
  interior: printTemplatePageSchema.optional(),
  fields: z.array(printTemplateFieldSchema).default([]),
  sampleOutputs: z
    .object({
      coverPdfUrl: z.string().url().optional().nullable(),
      interiorPdfUrl: z.string().url().optional().nullable(),
      coverPreviewUrl: z.string().url().optional().nullable(),
      interiorPreviewUrl: z.string().url().optional().nullable(),
      warnings: z.array(z.string()).optional().default([]),
      generatedAt: z.coerce.date().optional().nullable(),
    })
    .optional(),
});

export const createProductSchema = z.object({
  listingId: z.string().min(1, "Listing ID is required").trim(),
  storeId: z.string().min(1, "Store ID is required"),
  title: z.string().min(1, "Title is required").max(300).trim(),
  coverImageUrl: z.string().url().optional().nullable(),
  interiorPdfUrl: z.string().url().optional().nullable(),
  podPackageId: z.string().optional().nullable(),
  printTemplate: printTemplateSchema.optional(),
  variants: z
    .array(
      z.object({
        name: z.string().min(1),
        podPackageId: z.string().min(1),
        interiorPdfUrl: z.string().url().optional().nullable(),
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
  printTemplate: printTemplateSchema.optional(),
  variants: z
    .array(
      z.object({
        name: z.string().min(1),
        podPackageId: z.string().min(1),
        interiorPdfUrl: z.string().url().optional().nullable(),
      })
    )
    .optional(),
  isActive: z.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
