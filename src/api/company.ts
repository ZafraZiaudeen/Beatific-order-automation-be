import { Router, Request, Response, NextFunction } from "express";
import { createStoreSchema, updateStoreSchema } from "../domain/dtos/company";
import * as companyService from "../application/company";
import { isAuthenticated } from "./middleware/authentication-middleware";
import { isAdmin } from "./middleware/authorization-middleware";

const router = Router();

// GET /api/company — get company info
router.get("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await companyService.getCompanyInfo(req.auth!.companyId as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/company/stores — list stores
router.get("/stores", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await companyService.getStores(req.auth!.companyId as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/company/stores — create store (admin+)
router.post(
  "/stores",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createStoreSchema.parse(req.body);
      const result = await companyService.createStore(req.auth!.companyId as string, input);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/company/stores/:id — update store (admin+)
router.patch(
  "/stores/:id",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = updateStoreSchema.parse(req.body);
      const result = await companyService.updateStore(
        req.auth!.companyId as string,
        req.params.id as string,
        input
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/company/stores/:id — delete store (admin+)
router.delete(
  "/stores/:id",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await companyService.deleteStore(req.auth!.companyId as string, req.params.id as string);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
