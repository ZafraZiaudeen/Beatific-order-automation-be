import { NextFunction, Request, Response } from "express";
import UnauthorizedError from "../../domain/errors/unauthorized-error";
import { verifyAccessToken } from "../../infrastructure/jwt";

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Unauthorized");
  }

  const token = authorizationHeader.slice("Bearer ".length);
  req.auth = verifyAccessToken(token);
  next();
};
