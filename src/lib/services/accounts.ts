import "server-only";
import bcrypt from "bcryptjs";
import { db } from "../db/mongo";
import { AuthToken, Member, User, Workspace, Types } from "../db/models";
import { randomToken, sha256 } from "../crypto";
import { appUrl, config } from "../env";
import { sendEmail } from "../email";
import { AppError } from "../errors";

export async function createUserWithWorkspace(input: {
  email: string;
  name: string;
  password?: string;
  googleId?: string;
  image?: string;
  emailVerified?: boolean;
}) {
  await db();
  const email = input.email.toLowerCase().trim();
  if (await User.exists({ email })) throw new AppError("EMAIL_TAKEN", "An account with this email already exists.", 409, "email");

  const user = await User.create({
    email,
    name: input.name.trim(),
    passwordHash: input.password ? await bcrypt.hash(input.password, 12) : undefined,
    googleId: input.googleId,
    image: input.image,
    emailVerifiedAt: input.emailVerified ? new Date() : undefined,
    consentAt: new Date(),
  });
  const workspace = await Workspace.create({
    name: `${user.name.split(" ")[0]}'s workspace`,
    ownerId: user._id,
    type: "personal",
    planId: config.defaultPlan,
  });
  await Member.create({ workspaceId: workspace._id, userId: user._id, role: "owner" });
  user.lastWorkspaceId = workspace._id;
  await user.save();
  return user;
}

async function issueToken(userId: Types.ObjectId, type: "verify_email" | "reset_password", ttlMs: number) {
  const token = randomToken();
  await AuthToken.create({ userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

async function consumeToken(token: string, type: "verify_email" | "reset_password") {
  await db();
  const doc = await AuthToken.findOneAndUpdate(
    { tokenHash: sha256(token), type, usedAt: null, expiresAt: { $gt: new Date() } },
    { usedAt: new Date() },
  );
  if (!doc) throw new AppError("TOKEN_INVALID", "This link is invalid or has expired.");
  return doc;
}

export async function sendVerificationEmail(email: string) {
  await db();
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || user.emailVerifiedAt) return; // Say nothing either way.
  const token = await issueToken(user._id, "verify_email", 1000 * 60 * 60 * 24);
  await sendEmail({
    to: user.email,
    subject: "Confirm your email for Prasaar",
    lines: [`Hi ${user.name},`, "Confirm your email address to finish setting up your Prasaar account."],
    action: { label: "Confirm email", url: `${appUrl()}/api/verify-email?token=${token}` },
  });
}

export async function verifyEmail(token: string) {
  const doc = await consumeToken(token, "verify_email");
  await User.updateOne({ _id: doc.userId }, { emailVerifiedAt: new Date() });
}

export async function sendPasswordReset(email: string) {
  await db();
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return;
  const token = await issueToken(user._id, "reset_password", 1000 * 60 * 60);
  await sendEmail({
    to: user.email,
    subject: "Reset your Prasaar password",
    lines: [`Hi ${user.name},`, "Someone asked to reset your password. If that was you, use the link below. It works for one hour."],
    action: { label: "Choose a new password", url: `${appUrl()}/reset-password?token=${token}` },
  });
}

export async function resetPassword(token: string, password: string) {
  const doc = await consumeToken(token, "reset_password");
  // A working reset link proves the user owns the email, so mark it verified too.
  await User.updateOne(
    { _id: doc.userId },
    { passwordHash: await bcrypt.hash(password, 12), $min: { emailVerifiedAt: new Date() } },
  );
}
