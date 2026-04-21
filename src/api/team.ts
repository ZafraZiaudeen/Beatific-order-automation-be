import { Router, Request, Response, NextFunction } from "express";
import { inviteSchema, updateRoleSchema } from "../domain/dtos/team";
import * as teamService from "../application/team";
import { isAuthenticated } from "./middleware/authentication-middleware";
import { isAdmin } from "./middleware/authorization-middleware";

const router = Router();

const listTeam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await teamService.getTeamMembers(req.auth!.companyId as string);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const inviteTeamMember = async (req: Request, res: Response, next: NextFunction) => {
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
};

const updateTeamMemberRole = async (req: Request, res: Response, next: NextFunction) => {
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
};

const deleteTeamMember = async (req: Request, res: Response, next: NextFunction) => {
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
};

const cancelTeamInvitation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await teamService.cancelInvitation(
      req.auth!.companyId as string,
      req.params.invitationId as string
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
};

// GET /api/team - list members + pending invites
router.get("/", isAuthenticated, listTeam);
router.get("/members", isAuthenticated, listTeam);

// POST /api/team/invite - admin+ only
router.post("/invite", isAuthenticated, isAdmin, inviteTeamMember);

// PATCH /api/team/:userId/role - admin+ only
router.patch("/:userId/role", isAuthenticated, isAdmin, updateTeamMemberRole);
router.patch("/members/:userId/role", isAuthenticated, isAdmin, updateTeamMemberRole);

// DELETE /api/team/:userId - admin+ only
router.delete("/:userId", isAuthenticated, isAdmin, deleteTeamMember);
router.delete("/members/:userId", isAuthenticated, isAdmin, deleteTeamMember);

// DELETE /api/team/invite/:invitationId - cancel pending invite
router.delete("/invite/:invitationId", isAuthenticated, isAdmin, cancelTeamInvitation);
router.delete("/invitations/:invitationId", isAuthenticated, isAdmin, cancelTeamInvitation);

export default router;
