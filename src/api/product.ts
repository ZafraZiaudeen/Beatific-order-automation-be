import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { createProductSchema, updateProductSchema, printTemplateSchema } from "../domain/dtos/product";
import * as productService from "../application/product";
import * as templateService from "../application/template";
import { isAuthenticated } from "./middleware/authentication-middleware";
import ValidationError from "../domain/errors/validation-error";

const router = Router();

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.match(/\.pdf$/i)) {
      cb(null, true);
      return;
    }
    cb(new ValidationError("Only PDF files can be imported") as unknown as Error);
  },
});

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

// POST /api/products/:id/template/import
router.post(
  "/:id/template/import",
  isAuthenticated,
  pdfUpload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new ValidationError("No PDF file uploaded");
      const kind = req.body.kind;
      if (kind !== "cover" && kind !== "interior") {
        throw new ValidationError("Template import kind must be cover or interior");
      }

      const result = await templateService.importProductTemplatePdf(
        req.auth!.companyId as string,
        req.params.id as string,
        kind,
        req.file
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/products/:id/template
router.patch("/:id/template", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = printTemplateSchema.pick({ fields: true }).parse(req.body);
    const result = await templateService.saveProductPrintTemplate(
      req.auth!.companyId as string,
      req.params.id as string,
      { fields: input.fields }
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/products/:id/template/sample
router.post("/:id/template/sample", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await templateService.generateProductTemplateSample(
      req.auth!.companyId as string,
      req.params.id as string
    );
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
