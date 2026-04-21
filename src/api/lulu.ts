import { Router, Request, Response, NextFunction } from "express";
import { isAuthenticated } from "./middleware/authentication-middleware";
import * as luluService from "../application/lulu";
import { z } from "zod";

const router = Router();

const bulkSubmitSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1, "Select at least one order"),
});

// POST /api/lulu/submit/:orderId
router.post("/submit/:orderId", isAuthenticated, async (req: Request<{ orderId: string }>, res: Response, next: NextFunction) => {
  try {
    const shippingLevel: string | undefined = req.body?.shippingLevel;
    const order = await luluService.submitOrderToLulu(
      req.auth!.companyId as string,
      req.params.orderId,
      req.auth!.userId as string,
      shippingLevel
    );
    res.json(order);
  } catch (error) {
    next(error);
  }
});

// POST /api/lulu/bulk-submit
router.post("/bulk-submit", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderIds } = bulkSubmitSchema.parse(req.body);
    const result = await luluService.bulkSubmitToLulu(
      req.auth!.companyId as string,
      orderIds,
      req.auth!.userId as string
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/lulu/status/:orderId
router.get("/status/:orderId", isAuthenticated, async (req: Request<{ orderId: string }>, res: Response, next: NextFunction) => {
  try {
    const order = await luluService.refreshLuluStatus(
      req.auth!.companyId as string,
      req.params.orderId
    );
    res.json(order);
  } catch (error) {
    next(error);
  }
});

// POST /api/lulu/retry/:orderId
router.post("/retry/:orderId", isAuthenticated, async (req: Request<{ orderId: string }>, res: Response, next: NextFunction) => {
  try {
    const order = await luluService.retryLuluSubmission(
      req.auth!.companyId as string,
      req.params.orderId,
      req.auth!.userId as string
    );
    res.json(order);
  } catch (error) {
    next(error);
  }
});

export default router;
