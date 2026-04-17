import "dotenv/config";
import express from "express";
import cors from "cors";
import connectDB from "./infrastructure/db";
import globalErrorHandlingMiddleware from "./api/middleware/global-error-handling-middleware";
import authRouter from "./api/auth";
import teamRouter from "./api/team";
import companyRouter from "./api/company";

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/auth", authRouter);
app.use("/api/team", teamRouter);
app.use("/api/company", companyRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Global error handler (must be last)
app.use(globalErrorHandlingMiddleware);

// Connect to DB and start server
connectDB();
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
