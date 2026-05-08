import { Router, Request, Response, NextFunction } from "express";
import {
  updateOrderStatusSchema,
  updateOrderSchema,
  bulkStatusUpdateSchema,
  bulkDeleteOrdersSchema,
  templateValuesSchema,
} from "../domain/dtos/order";
import * as orderService from "../application/order";
import * as templateService from "../application/template";
import { isAuthenticated } from "./middleware/authentication-middleware";

const router = Router();

// GET /api/orders
router.get("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await orderService.getOrders(req.auth!.companyId as string, {
      storeId: req.query.storeId as string | undefined,
      etsyStatus: req.query.etsyStatus as string | undefined,
      luluStatus: req.query.luluStatus as string | undefined,
      search: req.query.search as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/orders/status-counts
router.get("/status-counts", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await orderService.getOrderStatusCounts(
      req.auth!.companyId as string,
      req.query.storeId as string | undefined,
      req.query.dateFrom as string | undefined,
      req.query.dateTo as string | undefined
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/orders/:id
router.get("/:id", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await orderService.getOrderById(req.auth!.companyId as string, req.params.id as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/orders/:id/events
router.get("/:id/events", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await orderService.getOrderEvents(req.params.id as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/orders/:id/template-values
router.patch("/:id/template-values", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = templateValuesSchema.parse(req.body);
    const result = await templateService.saveOrderTemplateValues(
      req.auth!.companyId as string,
      req.params.id as string,
      input.values
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/orders/:id/template-preview
router.post("/:id/template-preview", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = templateValuesSchema.parse(req.body);
    const result = await templateService.previewOrderTemplate(
      req.auth!.companyId as string,
      req.params.id as string,
      input.values
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/orders/:id/template-finalize
router.post("/:id/template-finalize", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = templateValuesSchema.parse(req.body);
    const result = await templateService.finalizeOrderTemplate(
      req.auth!.companyId as string,
      req.params.id as string,
      req.auth!.userId as string,
      input.values
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/orders/:id/status
router.patch("/:id/status", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateOrderStatusSchema.parse(req.body);
    const result = await orderService.updateOrderStatus(
      req.auth!.companyId as string,
      req.params.id as string,
      req.auth!.userId as string,
      input
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/orders/:id
router.patch("/:id", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateOrderSchema.parse(req.body);
    const result = await orderService.updateOrder(req.auth!.companyId as string, req.params.id as string, input);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/orders/bulk-status
router.post("/bulk-status", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = bulkStatusUpdateSchema.parse(req.body);
    const result = await orderService.bulkUpdateStatus(req.auth!.companyId as string, req.auth!.userId as string, input);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/orders/bulk
router.delete("/bulk", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = bulkDeleteOrdersSchema.parse(req.body);
    const result = await orderService.bulkDeleteOrders(req.auth!.companyId as string, input);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
