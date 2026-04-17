import crypto from "crypto";
import Company from "../infrastructure/schemas/Company";
import User from "../infrastructure/schemas/User";
import Invitation from "../infrastructure/schemas/Invitation";
import Store from "../infrastructure/schemas/Store";
import { hashPassword, comparePassword } from "../infrastructure/password";
import { signAccessToken } from "../infrastructure/jwt";
import {
  RegisterInput,
  LoginInput,
  VerifyEmailInput,
  AcceptInviteInput,
} from "../domain/dtos/auth";
import {
  generateVerificationCode,
  sendVerificationEmail,
} from "../infrastructure/email";
import ConflictError from "../domain/errors/conflict-error";
import NotFoundError from "../domain/errors/not-found-error";
import UnauthorizedError from "../domain/errors/unauthorized-error";
import ValidationError from "../domain/errors/validation-error";

export const register = async (input: RegisterInput) => {
  // Check if company name already exists (case-insensitive)
  const existingCompany = await Company.findOne({
    name: { $regex: new RegExp(`^${input.companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });

  if (existingCompany) {
    throw new ConflictError("A company with this name already exists");
  }

  // Check if email already exists across any company
  const existingUser = await User.findOne({ email: input.email });
  if (existingUser) {
    throw new ConflictError("An account with this email already exists");
  }

  // Hash password
  const passwordHash = await hashPassword(input.password);

  // Create company (owner will be set after user creation)
  const company = new Company({
    name: input.companyName,
    ownerId: "000000000000000000000000", // placeholder
  });
  await company.save();

  // Generate verification code
  const verificationCode = generateVerificationCode();
  const codeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // Create user as owner
  const user = new User({
    email: input.email,
    name: input.name,
    passwordHash,
    companyId: company._id,
    role: "owner",
    emailVerified: false,
    verificationCode,
    verificationCodeExpiresAt: codeExpiry,
  });
  await user.save();

  // Update company owner
  company.ownerId = user._id;
  await company.save();

  // Create a default store
  const defaultStore = new Store({
    name: input.companyName,
    companyId: company._id,
  });
  await defaultStore.save();

  // Send verification email
  await sendVerificationEmail(input.email, verificationCode, input.name);

  // Sign token (limited — email not verified yet)
  const token = signAccessToken({
    userId: user._id.toString(),
    companyId: company._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
  });

  return {
    token,
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
    },
    company: {
      _id: company._id,
      name: company.name,
    },
  };
};

export const login = async (input: LoginInput) => {
  // Find company by name (case-insensitive)
  const company = await Company.findOne({
    name: { $regex: new RegExp(`^${input.companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });

  if (!company) {
    throw new UnauthorizedError("Invalid company name, email, or password");
  }

  // Find user in that company
  const user = await User.findOne({ email: input.email, companyId: company._id });
  if (!user) {
    throw new UnauthorizedError("Invalid company name, email, or password");
  }

  // Compare password
  const isMatch = await comparePassword(input.password, user.passwordHash);
  if (!isMatch) {
    throw new UnauthorizedError("Invalid company name, email, or password");
  }

  // Get stores
  const stores = await Store.find({ companyId: company._id, isActive: true }).lean();

  const token = signAccessToken({
    userId: user._id.toString(),
    companyId: company._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
  });

  return {
    token,
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
    },
    company: {
      _id: company._id,
      name: company.name,
    },
    stores,
  };
};

export const verifyEmail = async (input: VerifyEmailInput) => {
  const user = await User.findOne({ email: input.email });
  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (user.emailVerified) {
    throw new ValidationError("Email is already verified");
  }

  if (!user.verificationCode || user.verificationCode !== input.code) {
    throw new ValidationError("Invalid verification code");
  }

  if (user.verificationCodeExpiresAt && user.verificationCodeExpiresAt < new Date()) {
    throw new ValidationError("Verification code has expired. Please request a new one.");
  }

  user.emailVerified = true;
  user.verificationCode = null;
  user.verificationCodeExpiresAt = null;
  await user.save();

  return { message: "Email verified successfully" };
};

export const resendVerificationCode = async (email: string) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (user.emailVerified) {
    throw new ValidationError("Email is already verified");
  }

  const code = generateVerificationCode();
  user.verificationCode = code;
  user.verificationCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();

  await sendVerificationEmail(email, code, user.name);

  return { message: "Verification code sent" };
};

export const acceptInvitation = async (input: AcceptInviteInput) => {
  const invitation = await Invitation.findOne({
    token: input.token,
    status: "pending",
  });

  if (!invitation) {
    throw new NotFoundError("Invitation not found or already used");
  }

  if (invitation.expiresAt < new Date()) {
    invitation.status = "expired";
    await invitation.save();
    throw new ValidationError("This invitation has expired");
  }

  // Check email matches invitation
  if (invitation.email !== input.email) {
    throw new ValidationError("Email does not match the invitation");
  }

  // Check if user already exists in this company
  const existingUser = await User.findOne({
    email: input.email,
    companyId: invitation.companyId,
  });

  if (existingUser) {
    throw new ConflictError("You already have an account in this company");
  }

  const passwordHash = await hashPassword(input.password);

  const user = new User({
    email: input.email,
    name: input.name,
    passwordHash,
    companyId: invitation.companyId,
    role: invitation.role,
    emailVerified: true, // Invitation implies email ownership
  });
  await user.save();

  invitation.status = "accepted";
  await invitation.save();

  const company = await Company.findById(invitation.companyId);
  const stores = await Store.find({ companyId: invitation.companyId, isActive: true }).lean();

  const token = signAccessToken({
    userId: user._id.toString(),
    companyId: invitation.companyId.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
  });

  return {
    token,
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
    },
    company: {
      _id: company?._id,
      name: company?.name,
    },
    stores,
  };
};

export const getMe = async (userId: string) => {
  const user = await User.findById(userId).lean();
  if (!user) throw new NotFoundError("User not found");

  const company = await Company.findById(user.companyId).lean();
  if (!company) throw new NotFoundError("Company not found");

  const stores = await Store.find({ companyId: user.companyId, isActive: true }).lean();

  return {
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
    },
    company: {
      _id: company._id,
      name: company.name,
    },
    stores,
  };
};
