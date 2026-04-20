import { Router, Request, Response, NextFunction } from "express";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendCodeSchema,
  acceptInviteSchema,
} from "../domain/dtos/auth";
import * as authService from "../application/auth";
import * as teamService from "../application/team";
import { isAuthenticated } from "./middleware/authentication-middleware";

const router = Router();

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/verify-email
router.post("/verify-email", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = verifyEmailSchema.parse(req.body);
    const result = await authService.verifyEmail(input);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/resend-code
router.post("/resend-code", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = resendCodeSchema.parse(req.body);
    const result = await authService.resendVerificationCode(input.email);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/accept-invite
router.post("/accept-invite", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = acceptInviteSchema.parse(req.body);
    const result = await authService.acceptInvitation(input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/invite/:token — public, returns invitation details
router.get("/invite/:token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await teamService.getInvitationByToken(req.params.token as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me — protected
router.get("/me", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.getMe(req.auth!.userId as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/auth/profile — update name
router.patch("/profile", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.updateProfile(req.auth!.userId as string, req.body.name);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/auth/password — change password
router.patch("/password", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(req.auth!.userId as string, currentPassword, newPassword);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;

