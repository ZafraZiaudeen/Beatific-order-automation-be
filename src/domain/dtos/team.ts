import { z } from "zod";

export const inviteSchema = z.object({
  email: z.string().email("Invalid email address").trim().toLowerCase(),
  role: z.enum(["admin", "member"], {
    errorMap: () => ({ message: "Role must be admin or member" }),
  }),
});

export const updateRoleSchema = z.object({
  role: z.enum(["admin", "member"], {
    errorMap: () => ({ message: "Role must be admin or member" }),
  }),
});

export type InviteInput = z.infer<typeof inviteSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
