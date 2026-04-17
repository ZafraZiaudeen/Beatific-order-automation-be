import crypto from "crypto";
import User from "../infrastructure/schemas/User";
import Invitation from "../infrastructure/schemas/Invitation";
import Company from "../infrastructure/schemas/Company";
import { InviteInput, UpdateRoleInput } from "../domain/dtos/team";
import { sendInvitationEmail } from "../infrastructure/email";
import ConflictError from "../domain/errors/conflict-error";
import ForbiddenError from "../domain/errors/forbidden-error";
import NotFoundError from "../domain/errors/not-found-error";
import ValidationError from "../domain/errors/validation-error";

export const getTeamMembers = async (companyId: string) => {
  const members = await User.find({ companyId })
    .select("_id email name role emailVerified createdAt")
    .sort({ createdAt: 1 })
    .lean();

  const pendingInvites = await Invitation.find({
    companyId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  })
    .select("_id email role invitedBy expiresAt createdAt")
    .populate("invitedBy", "name")
    .lean();

  return { members, pendingInvites };
};

export const inviteMember = async (
  companyId: string,
  invitedById: string,
  input: InviteInput
) => {
  // Check if user already exists in the company
  const existingUser = await User.findOne({
    email: input.email,
    companyId,
  });

  if (existingUser) {
    throw new ConflictError("This user is already a member of your company");
  }

  // Check if there's already a pending invitation
  const existingInvite = await Invitation.findOne({
    email: input.email,
    companyId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });

  if (existingInvite) {
    throw new ConflictError("An invitation has already been sent to this email");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invitation = new Invitation({
    email: input.email,
    companyId,
    role: input.role,
    token,
    invitedBy: invitedById,
    expiresAt,
  });
  await invitation.save();

  // Send invitation email
  const company = await Company.findById(companyId);
  const inviter = await User.findById(invitedById);
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const inviteLink = `${frontendUrl}/invite/${token}`;

  await sendInvitationEmail(
    input.email,
    company?.name || "Your Company",
    inviter?.name || "A team member",
    inviteLink
  );

  return invitation;
};

export const updateMemberRole = async (
  companyId: string,
  requesterId: string,
  targetUserId: string,
  input: UpdateRoleInput
) => {
  const targetUser = await User.findOne({ _id: targetUserId, companyId });
  if (!targetUser) throw new NotFoundError("User not found");

  // Cannot change owner's role
  if (targetUser.role === "owner") {
    throw new ForbiddenError("Cannot change the owner's role");
  }

  // Cannot change your own role
  if (targetUserId === requesterId) {
    throw new ForbiddenError("Cannot change your own role");
  }

  targetUser.role = input.role;
  await targetUser.save();

  return {
    _id: targetUser._id,
    email: targetUser.email,
    name: targetUser.name,
    role: targetUser.role,
  };
};

export const removeMember = async (
  companyId: string,
  requesterId: string,
  targetUserId: string
) => {
  const targetUser = await User.findOne({ _id: targetUserId, companyId });
  if (!targetUser) throw new NotFoundError("User not found");

  if (targetUser.role === "owner") {
    throw new ForbiddenError("Cannot remove the owner");
  }

  if (targetUserId === requesterId) {
    throw new ForbiddenError("Cannot remove yourself");
  }

  await User.deleteOne({ _id: targetUserId });

  return { message: "Member removed" };
};

export const cancelInvitation = async (companyId: string, invitationId: string) => {
  const invitation = await Invitation.findOne({ _id: invitationId, companyId, status: "pending" });
  if (!invitation) throw new NotFoundError("Invitation not found");

  invitation.status = "expired";
  await invitation.save();

  return { message: "Invitation cancelled" };
};

export const getInvitationByToken = async (token: string) => {
  const invitation = await Invitation.findOne({ token, status: "pending" });
  if (!invitation) throw new NotFoundError("Invitation not found or already used");

  if (invitation.expiresAt < new Date()) {
    invitation.status = "expired";
    await invitation.save();
    throw new ValidationError("This invitation has expired");
  }

  const company = await Company.findById(invitation.companyId).lean();

  return {
    email: invitation.email,
    role: invitation.role,
    company: {
      _id: company?._id,
      name: company?.name,
    },
  };
};
