import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import connectDB from "./infrastructure/db";
import globalErrorHandlingMiddleware from "./api/middleware/global-error-handling-middleware";
import authRouter from "./api/auth";
import teamRouter from "./api/team";
import companyRouter from "./api/company";
import productRouter from "./api/product";
import orderRouter from "./api/order";
import importRouter from "./api/import";
import luluRouter from "./api/lulu";
import uploadRouter from "./api/upload";
import notificationRouter from "./api/notification";
import { pollLuluStatuses } from "./application/lulu";

const app = express();

// Middleware
app.use(cors());
app.use(express.json({
  limit: "10mb",
  verify: (req, _res, buf) => {
    (req as express.Request).rawBody = buf.toString("utf8");
  },
}));

app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

// Routes
app.use("/api/auth", authRouter);
app.use("/api/team", teamRouter);
app.use("/api/company", companyRouter);
app.use("/api/products", productRouter);
app.use("/api/orders", orderRouter);
app.use("/api/import", importRouter);
app.use("/api/lulu", luluRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/notifications", notificationRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Global error handler (must be last)
app.use(globalErrorHandlingMiddleware);

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 8000;

  app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);

    try {
      await connectDB();
    } catch (error) {
      console.error("Initial MongoDB connection failed", error);
    }

    // Run cron jobs only in the long-lived local/server process.
    cron.schedule("0 */6 * * *", async () => {
      console.log("[Cron] Polling Lulu statuses...");
      try {
        const result = await pollLuluStatuses();
        console.log(`[Cron] Updated ${result.updated} orders`);
      } catch (err) {
        console.error("[Cron] Lulu polling failed:", err);
      }
    });

    console.log("[Cron] Lulu status polling scheduled (every 6 hours)");
  });
}

export default app;
