import Product from "../infrastructure/schemas/Product";
import { CreateProductInput, UpdateProductInput } from "../domain/dtos/product";
import ConflictError from "../domain/errors/conflict-error";
import NotFoundError from "../domain/errors/not-found-error";

export const getProducts = async (companyId: string, storeId?: string) => {
  const query: Record<string, unknown> = { companyId };
  if (storeId) query.storeId = storeId;
  return Product.find(query).sort({ createdAt: -1 }).lean();
};

export const getProductById = async (companyId: string, productId: string) => {
  const product = await Product.findOne({ _id: productId, companyId }).lean();
  if (!product) throw new NotFoundError("Product not found");
  return product;
};

export const getProductByListingId = async (companyId: string, listingId: string) => {
  return Product.findOne({ listingId, companyId }).lean();
};

export const createProduct = async (companyId: string, input: CreateProductInput) => {
  const existing = await Product.findOne({ listingId: input.listingId, companyId });
  if (existing) {
    throw new ConflictError(`Product with listing ID "${input.listingId}" already exists`);
  }

  const product = new Product({
    ...input,
    companyId,
  });
  await product.save();
  return product;
};

export const updateProduct = async (
  companyId: string,
  productId: string,
  input: UpdateProductInput
) => {
  const product = await Product.findOne({ _id: productId, companyId });
  if (!product) throw new NotFoundError("Product not found");

  if (input.title !== undefined) product.title = input.title;
  if (input.coverImageUrl !== undefined) product.coverImageUrl = input.coverImageUrl || null;
  if (input.interiorPdfUrl !== undefined) product.interiorPdfUrl = input.interiorPdfUrl || null;
  if (input.podPackageId !== undefined) product.podPackageId = input.podPackageId || null;
  if (input.variants !== undefined) product.variants = input.variants;
  if (input.isActive !== undefined) product.isActive = input.isActive;

  await product.save();
  return product;
};

export const deleteProduct = async (companyId: string, productId: string) => {
  const product = await Product.findOne({ _id: productId, companyId });
  if (!product) throw new NotFoundError("Product not found");
  await Product.deleteOne({ _id: productId });
  return { message: "Product deleted" };
};
