import { Router, Request, Response, NextFunction } from "express";
import { inviteSchema, updateRoleSchema } from "../domain/dtos/team";
import * as teamService from "../application/team";
import { isAuthenticated } from "./middleware/authentication-middleware";
import { isAdmin } from "./middleware/authorization-middleware";

const router = Router();

// GET /api/team — list members + pending invites
router.get("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await teamService.getTeamMembers(req.auth!.companyId as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/team/invite — admin+ only
router.post(
  "/invite",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = inviteSchema.parse(req.body);
      const result = await teamService.inviteMember(
        req.auth!.companyId as string,
        req.auth!.userId as string,
        input
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/team/:userId/role — admin+ only
router.patch(
  "/:userId/role",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = updateRoleSchema.parse(req.body);
      const result = await teamService.updateMemberRole(
        req.auth!.companyId as string,
        req.auth!.userId as string,
        req.params.userId as string,
        input
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/team/:userId — admin+ only
router.delete(
  "/:userId",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await teamService.removeMember(
        req.auth!.companyId as string,
        req.auth!.userId as string,
        req.params.userId as string
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/team/invite/:invitationId — cancel pending invite
router.delete(
  "/invite/:invitationId",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await teamService.cancelInvitation(
        req.auth!.companyId as string,
        req.params.invitationId as string
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
