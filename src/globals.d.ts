export {};

export type Role = "owner" | "admin" | "member";

declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
      auth?: {
        userId: string;
        companyId: string;
        email: string;
        name: string;
        role: Role;
      };
    }
  }
}
