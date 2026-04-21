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

const DEFAULT_INVITATION_EXPIRES_HOURS = 48;

const getInvitationExpiryHours = () => {
  const parsed = Number(process.env.INVITATION_EXPIRES_HOURS);

  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return DEFAULT_INVITATION_EXPIRES_HOURS;
};

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
  const existingUser = await User.findOne({
    email: input.email,
    companyId,
  });

  if (existingUser) {
    throw new ConflictError("This user is already a member of your company");
  }

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
  const expiresInHours = getInvitationExpiryHours();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const invitation = new Invitation({
    email: input.email,
    companyId,
    role: input.role,
    token,
    invitedBy: invitedById,
    expiresAt,
  });
  await invitation.save();

  const company = await Company.findById(companyId);
  const inviter = await User.findById(invitedById);
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const inviteLink = `${frontendUrl}/invite/${token}`;

  const delivery = await sendInvitationEmail({
    email: input.email,
    companyName: company?.name || "Your Company",
    inviterName: inviter?.name || "A team member",
    inviteLink,
    role: input.role,
    expiresAt,
    expiresInHours,
  });

  const invitationSummary = {
    _id: invitation._id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };

  if (delivery.delivered) {
    return {
      invitation: invitationSummary,
      emailSent: true,
      message: "Invitation sent successfully",
    };
  }

  return {
    invitation: invitationSummary,
    emailSent: false,
    inviteLink,
    deliveryError: delivery.error,
    message:
      "Invitation created, but the email could not be delivered. Copy the invite link and share it manually.",
  };
};

export const updateMemberRole = async (
  companyId: string,
  requesterId: string,
  targetUserId: string,
  input: UpdateRoleInput
) => {
  const targetUser = await User.findOne({ _id: targetUserId, companyId });
  if (!targetUser) throw new NotFoundError("User not found");

  if (targetUser.role === "owner") {
    throw new ForbiddenError("Cannot change the owner's role");
  }

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
    expiresAt: invitation.expiresAt,
    company: {
      _id: company?._id,
      name: company?.name,
    },
  };
};
