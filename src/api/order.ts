import { Router, Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import {
  ingestOrderSchema,
  updateOrderStatusSchema,
  updateOrderSchema,
  bulkStatusUpdateSchema,
  bulkDeleteOrdersSchema,
  templateValuesSchema,
} from "../domain/dtos/order";
import * as orderService from "../application/order";
import * as templateService from "../application/template";
import { isAuthenticated } from "./middleware/authentication-middleware";
import UnauthorizedError from "../domain/errors/unauthorized-error";
import ValidationError from "../domain/errors/validation-error";

const router = Router();

const timingSafeStringEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const collectCandidateBodies = (req: Request) => {
  const candidates = new Set<string>();

  if (typeof req.rawBody === "string" && req.rawBody.length > 0) {
    candidates.add(req.rawBody);

    try {
      candidates.add(JSON.stringify(JSON.parse(req.rawBody)));
    } catch {
      // Raw body is not parseable JSON; keep the original body candidate only.
    }
  }

  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      candidates.add(req.body);
    } else {
      candidates.add(JSON.stringify(req.body));
    }
  }

  return [...candidates].filter((value) => value.length > 0);
};

const verifyIngestSignature = (req: Request) => {
  const secret = process.env.N8N_INGEST_SECRET || process.env.INGEST_SECRET;
  if (!secret) {
    throw new Error("N8N_INGEST_SECRET or INGEST_SECRET is missing in backend env");
  }

  const signature = String(req.header("x-signature") || "").trim();
  if (!signature) throw new UnauthorizedError("Missing n8n ingest signature");

  const bodyCandidates = collectCandidateBodies(req);
  const secretCandidates = new Set([secret]);
  const trimmedSecret = secret.trim();
  if (trimmedSecret && trimmedSecret !== secret) {
    secretCandidates.add(trimmedSecret);
  }

  for (const candidateSecret of secretCandidates) {
    for (const candidateBody of bodyCandidates) {
      const expectedHex = createHmac("sha256", candidateSecret).update(candidateBody).digest("hex");
      const expectedPrefixed = `sha256=${expectedHex}`;

      if (
        timingSafeStringEqual(signature, expectedHex) ||
        timingSafeStringEqual(signature, expectedPrefixed)
      ) {
        return;
      }
    }
  }

  throw new UnauthorizedError("Invalid n8n ingest signature");
};

// POST /api/orders/ingest -- signed n8n order ingest
router.post("/ingest", async (req: Request, res: Response, next: NextFunction) => {
  try {
    verifyIngestSignature(req);

    const headerCompanyId = String(req.header("x-company-id") || "").trim();
    const bodyCompanyId = typeof req.body?.companyId === "string" ? req.body.companyId.trim() : "";
    const companyId = headerCompanyId || bodyCompanyId;
    if (!companyId) throw new ValidationError("X-Company-Id header is required");
    if (bodyCompanyId && bodyCompanyId !== companyId) {
      throw new ValidationError("Body companyId does not match X-Company-Id");
    }

    const input = ingestOrderSchema.parse({ ...req.body, companyId });
    const result = await orderService.ingestOrderFromN8n(companyId, input);
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    next(error);
  }
});

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
