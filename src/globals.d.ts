export {};

export type Role = "owner" | "admin" | "member";

declare global {
  namespace Express {
    interface Request {
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
