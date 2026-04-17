import jwt from "jsonwebtoken";
import UnauthorizedError from "../domain/errors/unauthorized-error";
import { Role } from "../globals";

export type AuthTokenPayload = {
  userId: string;
  companyId: string;
  email: string;
  name: string;
  role: Role;
};

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing in env");
  }

  return secret;
};

export const signAccessToken = (payload: AuthTokenPayload) =>
  jwt.sign(payload as object, getJwtSecret(), {
    expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as string,
  } as jwt.SignOptions);

export const verifyAccessToken = (token: string) => {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
  } catch (error) {
    throw new UnauthorizedError("Invalid or expired token");
  }
};
