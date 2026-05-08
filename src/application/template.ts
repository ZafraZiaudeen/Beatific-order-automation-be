import Product, {
  IProduct,
  PrintTemplate,
  PrintTemplateField,
  ProductVariant,
  TemplatePolicyValue,
} from "../infrastructure/schemas/Product";
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

type TemplatePolicy = {
  cover: TemplatePolicyValue;
  interior: TemplatePolicyValue;
  fields: TemplatePolicyValue;
};

const DEFAULT_POLICY: TemplatePolicy = {
  cover: "inherit",
  interior: "inherit",
  fields: "inherit",
};

const safeFilename = (filename: string) =>
  filename.replace(/[^\w.\-]+/g, "_").replace(/^_+/, "") || "template.pdf";

const emptyTemplate = (): PrintTemplate => ({ cover: null, interior: null, fields: [] });

const normalizePolicy = (policy?: ProductVariant["templatePolicy"] | null): TemplatePolicy => ({
  ...DEFAULT_POLICY,
  ...(policy || {}),
});

const getVariantId = (variant?: ProductVariant | null) => {
  const raw = (variant as any)?._id;
  return raw ? String(raw) : null;
};

const getProductOrThrow = async (companyId: string, productId: string) => {
  const product = await Product.findOne({ _id: productId, companyId });
  if (!product) throw new NotFoundError("Product not found");
  return product;
};

const findVariant = (
  product: { variants?: ProductVariant[] },
  variantIdOrName?: string | null
) => {
  if (!variantIdOrName || !product.variants?.length) return null;
  const key = String(variantIdOrName);
  const docArrayMatch = (product.variants as any).id?.(key);
  if (docArrayMatch) return docArrayMatch as ProductVariant;
  return (
    product.variants.find((variant) => {
      const id = getVariantId(variant);
      return id === key || variant.name === key || variant.name?.toLowerCase() === key.toLowerCase();
    }) || null
  );
};

const ensureTemplate = (product: IProduct) => {
  if (!product.printTemplate) product.printTemplate = emptyTemplate();
  if (!product.printTemplate.fields) product.printTemplate.fields = [];
  return product.printTemplate;
};

const ensureVariantTemplate = (product: IProduct, variantId: string) => {
  const variant = findVariant(product, variantId);
  if (!variant) throw new NotFoundError("Product variant not found");
  if (!variant.printTemplate) variant.printTemplate = emptyTemplate();
  if (!variant.printTemplate.fields) variant.printTemplate.fields = [];
  variant.templatePolicy = normalizePolicy(variant.templatePolicy);
  return { variant, template: variant.printTemplate };
};

export const resolveEffectiveTemplate = (
  product: { printTemplate?: PrintTemplate; variants?: ProductVariant[] },
  variantIdOrName?: string | null
) => {
  const base = product.printTemplate || emptyTemplate();
  const variant = findVariant(product, variantIdOrName);
  const policy = normalizePolicy(variant?.templatePolicy);
  const override = variant?.printTemplate;

  const cover =
    variant && policy.cover === "override" && override?.cover?.sourcePdfUrl
      ? override.cover
      : base.cover || null;
  const interior =
    variant && policy.interior === "override" && override?.interior?.sourcePdfUrl
      ? override.interior
      : base.interior || null;
  const fields =
    variant && policy.fields === "override"
      ? override?.fields || []
      : base.fields || [];

  return {
    variant,
    variantId: getVariantId(variant),
    policy,
    template: {
      cover,
      interior,
      fields,
      sampleOutputs: variant ? override?.sampleOutputs : base.sampleOutputs,
    } as PrintTemplate,
  };
};

export const productHasPrintTemplate = (
  product: { printTemplate?: PrintTemplate; variants?: ProductVariant[] },
  variantIdOrName?: string | null
) => {
  const { template } = resolveEffectiveTemplate(product, variantIdOrName);
  return Boolean(
    template.fields?.length &&
      (template.cover?.sourcePdfUrl || template.interior?.sourcePdfUrl)
  );
};

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
  mode: "sample" | "preview" | "final",
  variantIdOrName?: string | null
): Promise<{ result: TemplateRenderResult; template: PrintTemplate; variant: ProductVariant | null }> => {
  const { template, variant } = resolveEffectiveTemplate(product, variantIdOrName);
  if (!template.fields?.length) {
    throw new ValidationError("This product does not have a print template yet");
  }

  const result = await renderTemplatePdfs({
    coverPdfUrl: template.cover?.sourcePdfUrl || null,
    interiorPdfUrl: template.interior?.sourcePdfUrl || null,
    fields: template.fields,
    values,
    mode,
  });

  return { result, template, variant };
};

const importedPageFromFile = async (
  companyId: string,
  productId: string,
  folderSuffix: string,
  kind: TemplateImportKind,
  file: UploadedFile
) => {
  if (!file.originalname.match(/\.pdf$/i) && file.mimetype !== "application/pdf") {
    throw new ValidationError("Only PDF files can be imported as templates");
  }

  const filename = safeFilename(file.originalname);
  const upload = await uploadBufferToCloudinary(file.buffer, {
    folder: `beatific/product-templates/${companyId}/${productId}${folderSuffix}`,
    filename,
    resourceType: "raw",
  });
  const page = await decomposeTemplatePdf(file.buffer, filename, kind);
  return {
    sourcePdfUrl: upload.secureUrl,
    previewImageUrl: page.previewImageUrl,
    pageWidth: page.pageWidth,
    pageHeight: page.pageHeight,
    pageCount: page.pageCount,
    extractedText: page.extractedText,
  };
};

export const importProductTemplatePdf = async (
  companyId: string,
  productId: string,
  kind: TemplateImportKind,
  file: UploadedFile
) => {
  const product = await getProductOrThrow(companyId, productId);
  const template = ensureTemplate(product);
  const nextPage = await importedPageFromFile(companyId, productId, "", kind, file);

  if (kind === "cover") template.cover = nextPage;
  if (kind === "interior") template.interior = nextPage;

  product.markModified("printTemplate");
  await product.save();
  return product.toObject();
};

export const importVariantTemplatePdf = async (
  companyId: string,
  productId: string,
  variantId: string,
  kind: TemplateImportKind,
  file: UploadedFile
) => {
  const product = await getProductOrThrow(companyId, productId);
  const { variant, template } = ensureVariantTemplate(product, variantId);
  const nextPage = await importedPageFromFile(companyId, productId, `/variants/${variantId}`, kind, file);

  if (kind === "cover") {
    template.cover = nextPage;
    variant.templatePolicy = { ...normalizePolicy(variant.templatePolicy), cover: "override" };
  }
  if (kind === "interior") {
    template.interior = nextPage;
    variant.templatePolicy = { ...normalizePolicy(variant.templatePolicy), interior: "override" };
  }

  product.markModified("variants");
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

export const saveVariantPrintTemplate = async (
  companyId: string,
  productId: string,
  variantId: string,
  input: {
    fields?: PrintTemplateField[];
    templatePolicy?: Partial<TemplatePolicy>;
  }
) => {
  const product = await getProductOrThrow(companyId, productId);
  const { variant, template } = ensureVariantTemplate(product, variantId);
  if (input.templatePolicy) {
    variant.templatePolicy = {
      ...normalizePolicy(variant.templatePolicy),
      ...input.templatePolicy,
    };
  }
  if (input.fields !== undefined) {
    template.fields = input.fields;
    variant.templatePolicy = {
      ...normalizePolicy(variant.templatePolicy),
      fields: "override",
    };
  }
  product.markModified("variants");
  await product.save();
  return product.toObject();
};

export const generateProductTemplateSample = async (
  companyId: string,
  productId: string,
  variantId?: string | null
) => {
  const product = await getProductOrThrow(companyId, productId);
  const { template } = resolveEffectiveTemplate(product, variantId);
  if (!template.fields?.length) {
    throw new ValidationError("Add at least one template field before generating a sample");
  }

  const { result } = await renderForProduct(
    product,
    buildFieldValues(template.fields),
    "sample",
    variantId
  );
  const sampleOutputs = {
    coverPdfUrl: result.coverPdfUrl,
    interiorPdfUrl: result.interiorPdfUrl,
    coverPreviewUrl: result.coverPreviewUrl,
    interiorPreviewUrl: result.interiorPreviewUrl,
    warnings: result.warnings,
    generatedAt: new Date(),
  };

  if (variantId) {
    const variantTemplate = ensureVariantTemplate(product, variantId).template;
    variantTemplate.sampleOutputs = sampleOutputs;
    product.markModified("variants");
  } else {
    const productTemplate = ensureTemplate(product);
    productTemplate.sampleOutputs = sampleOutputs;
    product.markModified("printTemplate");
  }

  await product.save();
  return { product: product.toObject(), sample: sampleOutputs };
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

  const variantKey = order.matchedVariantId || order.matchedVariantName || null;
  if (!productHasPrintTemplate(product, variantKey)) {
    throw new ValidationError("The mapped product does not have a print template");
  }

  return { order, product, variantKey };
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
  const { order, product, variantKey } = await getOrderAndProduct(companyId, orderId);
  const { template } = resolveEffectiveTemplate(product, variantKey);
  const fields = template.fields || [];
  const resolvedValues = resolveOrderValues(order, fields, values);
  order.templateFieldValues = resolvedValues;

  const { result } = await renderForProduct(product, resolvedValues, "preview", variantKey);
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
  const { order, product, variantKey } = await getOrderAndProduct(companyId, orderId);
  const { template } = resolveEffectiveTemplate(product, variantKey);
  const fields = template.fields || [];
  const resolvedValues = resolveOrderValues(order, fields, values);
  const missing = missingRequiredFields(fields, resolvedValues);
  if (missing.length) {
    throw new ValidationError(`Missing required personalization: ${missing.join(", ")}`);
  }
  if (!order.podPackageId) {
    throw new ValidationError("Pod Package ID is required before finalizing the print PDFs");
  }

  const { result } = await renderForProduct(product, resolvedValues, "final", variantKey);
  if (result.warnings.length) {
    order.templateFieldValues = resolvedValues;
    order.templateWarnings = result.warnings;
    await order.save();
    throw new ValidationError(`Template needs review: ${result.warnings.join("; ")}`);
  }
  if (!result.coverPdfUrl && template.cover?.sourcePdfUrl) {
    throw new ValidationError("Final cover PDF was not generated");
  }
  if (!result.interiorPdfUrl && template.interior?.sourcePdfUrl) {
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
