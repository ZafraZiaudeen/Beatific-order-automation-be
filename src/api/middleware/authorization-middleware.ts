import { NextFunction, Request, Response } from "express";
import ForbiddenError from "../../domain/errors/forbidden-error";

const ensureRole =
  (roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      throw new ForbiddenError("Forbidden");
    }

    next();
  };

export const isAdmin = ensureRole(["owner", "admin"]);
export const isOwner = ensureRole(["owner"]);
