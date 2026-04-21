import { NextFunction, Request, Response } from "express";
import axios from "axios";
import { ZodError } from "zod";

const globalErrorHandlingMiddleware = (
  error: Error & { code?: number | string },
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (axios.isAxiosError(error)) {
    console.error("AxiosError", {
      message: error.message,
      method: error.config?.method?.toUpperCase(),
      url: error.config?.url,
      status: error.response?.status,
    });
  } else {
    console.error(error);
  }

  if (error instanceof ZodError) {
    const messages = error.errors.map((e) => e.message).join(", ");
    res.status(400).json({ message: messages });
    return;
  }

  if (error.name === "NotFoundError") {
    res.status(404).json({ message: error.message });
    return;
  }

  if (error.name === "ValidationError") {
    res.status(400).json({ message: error.message });
    return;
  }

  if (error.name === "UnauthorizedError") {
    res.status(401).json({ message: error.message });
    return;
  }

  if (error.name === "ForbiddenError") {
    res.status(403).json({ message: error.message });
    return;
  }

  if (error.name === "ConflictError") {
    res.status(409).json({ message: error.message });
    return;
  }

  if (error.code === 11000) {
    res.status(409).json({ message: "A record with the same unique value already exists" });
    return;
  }

  res.status(500).json({ message: "Internal Server Error" });
};

export default globalErrorHandlingMiddleware;
