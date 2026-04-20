import { Router, Request, Response, NextFunction } from "express";
import { isAuthenticated } from "./middleware/authentication-middleware";
import * as notificationService from "../application/notification";

const router = Router();

// GET /api/notifications
router.get("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unreadOnly = req.query.unread === "true";
    const notifications = await notificationService.getNotifications(
      req.auth!.companyId as string,
      unreadOnly
    );
    const unreadCount = await notificationService.getUnreadCount(req.auth!.companyId as string);
    res.json({ notifications, unreadCount });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", isAuthenticated, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    await notificationService.markAsRead(req.auth!.companyId as string, req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/notifications/read-all
router.post("/read-all", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationService.markAllAsRead(req.auth!.companyId as string);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
