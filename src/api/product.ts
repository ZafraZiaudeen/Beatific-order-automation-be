import { Router, Request, Response, NextFunction } from "express";
import { createProductSchema, updateProductSchema } from "../domain/dtos/product";
import * as productService from "../application/product";
import { isAuthenticated } from "./middleware/authentication-middleware";

const router = Router();

// GET /api/products
router.get("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.query.storeId as string | undefined;
    const result = await productService.getProducts(req.auth!.companyId as string, storeId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/products/:id
router.get("/:id", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await productService.getProductById(req.auth!.companyId as string, req.params.id as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/products
router.post("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createProductSchema.parse(req.body);
    const result = await productService.createProduct(req.auth!.companyId as string, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/products/:id
router.patch("/:id", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateProductSchema.parse(req.body);
    const result = await productService.updateProduct(req.auth!.companyId as string, req.params.id as string, input);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/products/:id
router.delete("/:id", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await productService.deleteProduct(req.auth!.companyId as string, req.params.id as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
