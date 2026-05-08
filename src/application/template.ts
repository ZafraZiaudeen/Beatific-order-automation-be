import Product, { IProduct, PrintTemplateField } from "../infrastructure/schemas/Product";
import Order from "../infrastructure/schemas/Order";
import OrderEvent from "../infrastructure/schemas/OrderEvent";
import NotFoundError from "../domain/errors/not-found-error";
import ValidationError from "../domain/errors/validation-error";
import { uploadBufferToCloudinary } from "../infrastructure/cloudinary";
import {
  decomposeTemplatePdf,
  renderTemplatePdfs,
  TemplateImportKind,
  TemplateRenderResult,
} from "../infrastructure/pdf-template";

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
};

const safeFilename = (filename: string) =>
  filename.replace(/[^\w.\-]+/g, "_").replace(/^_+/, "") || "template.pdf";

const getProductOrThrow = async (companyId: string, productId: string) => {
  const product = await Product.findOne({ _id: productId, companyId });
  if (!product) throw new NotFoundError("Product not found");
  return product;
};

const ensureTemplate = (product: IProduct) => {
  if (!product.printTemplate) {
    product.printTemplate = { cover: null, interior: null, fields: [] };
  }
  if (!product.printTemplate.fields) product.printTemplate.fields = [];
  return product.printTemplate;
};

export const productHasPrintTemplate = (product: {
  printTemplate?: { fields?: unknown[]; cover?: { sourcePdfUrl?: string | null } | null; interior?: { sourcePdfUrl?: string | null } | null };
}) =>
  Boolean(
    product.printTemplate?.fields?.length &&
      (product.printTemplate.cover?.sourcePdfUrl || product.printTemplate.interior?.sourcePdfUrl)
  );

const buildFieldValues = (
  fields: PrintTemplateField[],
  values?: Record<string, string>
) => {
  const output: Record<string, string> = {};
  for (const field of fields) {
    output[field.key] = values?.[field.key] ?? field.sampleValue ?? "";
  }
  return output;
};

const missingRequiredFields = (
  fields: PrintTemplateField[],
  values: Record<string, string>
) =>
  fields
    .filter((field) => field.required && !String(values[field.key] || "").trim())
    .map((field) => field.label || field.key);

const renderForProduct = async (
  product: IProduct,
  values: Record<string, string>,
  mode: "sample" | "preview" | "final"
): Promise<TemplateRenderResult> => {
  const template = product.printTemplate;
  if (!template || !template.fields?.length) {
    throw new ValidationError("This product does not have a print template yet");
  }

  return renderTemplatePdfs({
    coverPdfUrl: template.cover?.sourcePdfUrl || null,
    interiorPdfUrl: template.interior?.sourcePdfUrl || null,
    fields: template.fields,
    values,
    mode,
  });
};

export const importProductTemplatePdf = async (
  companyId: string,
  productId: string,
  kind: TemplateImportKind,
  file: UploadedFile
) => {
  if (!file.originalname.match(/\.pdf$/i) && file.mimetype !== "application/pdf") {
    throw new ValidationError("Only PDF files can be imported as templates");
  }

  const product = await getProductOrThrow(companyId, productId);
  const template = ensureTemplate(product);
  const filename = safeFilename(file.originalname);
  const upload = await uploadBufferToCloudinary(file.buffer, {
    folder: `beatific/product-templates/${companyId}/${productId}`,
    filename,
    resourceType: "raw",
  });
  const page = await decomposeTemplatePdf(file.buffer, filename, kind);
  const nextPage = {
    sourcePdfUrl: upload.secureUrl,
    previewImageUrl: page.previewImageUrl,
    pageWidth: page.pageWidth,
    pageHeight: page.pageHeight,
    pageCount: page.pageCount,
    extractedText: page.extractedText,
  };

  if (kind === "cover") template.cover = nextPage;
  if (kind === "interior") template.interior = nextPage;

  product.markModified("printTemplate");
  await product.save();
  return product.toObject();
};

export const saveProductPrintTemplate = async (
  companyId: string,
  productId: string,
  input: {
    fields?: PrintTemplateField[];
  }
) => {
  const product = await getProductOrThrow(companyId, productId);
  const template = ensureTemplate(product);
  if (input.fields) template.fields = input.fields;
  product.markModified("printTemplate");
  await product.save();
  return product.toObject();
};

export const generateProductTemplateSample = async (
  companyId: string,
  productId: string
) => {
  const product = await getProductOrThrow(companyId, productId);
  const template = product.printTemplate;
  if (!template?.fields?.length) {
    throw new ValidationError("Add at least one template field before generating a sample");
  }

  const result = await renderForProduct(product, buildFieldValues(template.fields), "sample");
  template.sampleOutputs = {
    coverPdfUrl: result.coverPdfUrl,
    interiorPdfUrl: result.interiorPdfUrl,
    coverPreviewUrl: result.coverPreviewUrl,
    interiorPreviewUrl: result.interiorPreviewUrl,
    warnings: result.warnings,
    generatedAt: new Date(),
  };
  product.markModified("printTemplate");
  await product.save();
  return { product: product.toObject(), sample: template.sampleOutputs };
};

export const saveOrderTemplateValues = async (
  companyId: string,
  orderId: string,
  values: Record<string, string>
) => {
  const order = await Order.findOne({ _id: orderId, companyId });
  if (!order) throw new NotFoundError("Order not found");
  order.templateFieldValues = values;
  await order.save();
  return order;
};

const getOrderAndProduct = async (companyId: string, orderId: string) => {
  const order = await Order.findOne({ _id: orderId, companyId });
  if (!order) throw new NotFoundError("Order not found");
  if (!order.productId) throw new ValidationError("This order is not mapped to a product");

  const product = await Product.findOne({ _id: order.productId, companyId });
  if (!product) throw new NotFoundError("Product not found");
  if (!productHasPrintTemplate(product)) {
    throw new ValidationError("The mapped product does not have a print template");
  }

  return { order, product };
};

const resolveOrderValues = (
  order: { templateFieldValues?: Record<string, string>; templateAiSuggestions?: Record<string, string> },
  fields: PrintTemplateField[],
  incoming?: Record<string, string>
) => {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.key] =
      incoming?.[field.key] ??
      order.templateFieldValues?.[field.key] ??
      order.templateAiSuggestions?.[field.key] ??
      "";
  }
  return values;
};

export const previewOrderTemplate = async (
  companyId: string,
  orderId: string,
  values?: Record<string, string>
) => {
  const { order, product } = await getOrderAndProduct(companyId, orderId);
  const fields = product.printTemplate?.fields || [];
  const resolvedValues = resolveOrderValues(order, fields, values);
  order.templateFieldValues = resolvedValues;

  const result = await renderForProduct(product, resolvedValues, "preview");
  order.templateWarnings = [
    ...missingRequiredFields(fields, resolvedValues).map((label) => `Missing required field: ${label}`),
    ...result.warnings,
  ];
  await order.save();
  return { values: resolvedValues, preview: result, warnings: order.templateWarnings };
};

export const finalizeOrderTemplate = async (
  companyId: string,
  orderId: string,
  userId: string,
  values?: Record<string, string>
) => {
  const { order, product } = await getOrderAndProduct(companyId, orderId);
  const fields = product.printTemplate?.fields || [];
  const resolvedValues = resolveOrderValues(order, fields, values);
  const missing = missingRequiredFields(fields, resolvedValues);
  if (missing.length) {
    throw new ValidationError(`Missing required personalization: ${missing.join(", ")}`);
  }
  if (!order.podPackageId) {
    throw new ValidationError("Pod Package ID is required before finalizing the print PDFs");
  }

  const result = await renderForProduct(product, resolvedValues, "final");
  if (result.warnings.length) {
    order.templateFieldValues = resolvedValues;
    order.templateWarnings = result.warnings;
    await order.save();
    throw new ValidationError(`Template needs review: ${result.warnings.join("; ")}`);
  }
  if (!result.coverPdfUrl && product.printTemplate?.cover?.sourcePdfUrl) {
    throw new ValidationError("Final cover PDF was not generated");
  }
  if (!result.interiorPdfUrl && product.printTemplate?.interior?.sourcePdfUrl) {
    throw new ValidationError("Final inside pages PDF was not generated");
  }

  const fromStatus = order.etsyStatus;
  order.templateFieldValues = resolvedValues;
  order.templateWarnings = [];
  order.templateFinalizedAt = new Date();
  order.requiresTemplateFinalization = false;
  if (result.coverPdfUrl) order.coverImageUrl = result.coverPdfUrl;
  if (result.interiorPdfUrl) order.interiorPdfUrl = result.interiorPdfUrl;
  order.etsyStatus = "ready_to_order";

  await order.save();

  if (fromStatus !== "ready_to_order") {
    await new OrderEvent({
      orderId: order._id,
      companyId,
      fromStatus,
      toStatus: "ready_to_order",
      statusType: "etsy",
      userId,
      note: "Personalized print PDFs generated and frozen",
    }).save();
  }

  return { order, final: result };
};
