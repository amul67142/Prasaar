import "server-only";
import { db } from "../db/mongo";
import { AuditLog, Invite, Member, User, Workspace, Types, ROLES } from "../db/models";
import { randomToken, sha256 } from "../crypto";
import { appUrl } from "../env";
import { sendEmail } from "../email";
import { AppError, forbidden, notFound } from "../errors";
import type { Role } from "../permissions";
import { assertCan, type Ctx } from "../session";
import { TIMEZONES } from "../time";

export async function listWorkspacesForUser(userId: Types.ObjectId) {
  await db();
  const members = await Member.find({ userId }).lean();
  const workspaces = await Workspace.find({ _id: { $in: members.map((m) => m.workspaceId) } }).select("name type").lean();
  const roleOf = new Map(members.map((m) => [m.workspaceId.toString(), m.role as Role]));
  return workspaces
    .map((w) => ({ id: w._id.toString(), name: w.name, type: w.type, role: roleOf.get(w._id.toString())! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getWorkspace(ctx: Ctx) {
  await db();
  const w = await Workspace.findById(ctx.workspaceId).lean();
  if (!w) throw notFound("Workspace");
  return { id: w._id.toString(), name: w.name, type: w.type, timezone: w.timezone, planId: w.planId };
}

export async function createWorkspace(userId: Types.ObjectId, name: string) {
  await db();
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new AppError("NAME_REQUIRED", "Give the workspace a name.", 400, "name");
  const w = await Workspace.create({ name: clean, ownerId: userId, type: "personal", planId: process.env.DEFAULT_PLAN ?? "beta" });
  await Member.create({ workspaceId: w._id, userId, role: "owner" });
  return w._id.toString();
}

export async function updateWorkspace(ctx: Ctx, input: { name?: string; timezone?: string }) {
  assertCan(ctx, "workspace:manage");
  await db();
  const set: Record<string, string> = {};
  if (input.name !== undefined) {
    const name = input.name.trim().slice(0, 80);
    if (!name) throw new AppError("NAME_REQUIRED", "Give the workspace a name.", 400, "name");
    set.name = name;
  }
  if (input.timezone !== undefined) {
    if (!TIMEZONES.includes(input.timezone)) throw new AppError("INVALID_TIMEZONE", "Pick a timezone from the list.", 400, "timezone");
    set.timezone = input.timezone;
  }
  await Workspace.updateOne({ _id: ctx.workspaceId }, set);
}

export async function listMembers(ctx: Ctx) {
  await db();
  const members = await Member.find({ workspaceId: ctx.workspaceId }).lean();
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }).select("name email image").lean();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  const invites = await Invite.find({ workspaceId: ctx.workspaceId, acceptedAt: null, expiresAt: { $gt: new Date() } }).lean();
  return {
    members: members.map((m) => {
      const u = byId.get(m.userId.toString());
      return { id: m._id.toString(), userId: m.userId.toString(), name: u?.name ?? "Unknown", email: u?.email ?? "", image: u?.image, role: m.role as Role };
    }),
    invites: invites.map((i) => ({ id: i._id.toString(), email: i.email, role: i.role as Role, expiresAt: i.expiresAt.toISOString() })),
  };
}

export async function inviteMember(ctx: Ctx, emailRaw: string, role: Role) {
  assertCan(ctx, "team:manage");
  await db();
  const email = emailRaw.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("INVALID_EMAIL", "Enter a valid email address.", 400, "email");
  if (!ROLES.includes(role) || role === "owner") throw new AppError("INVALID_ROLE", "Pick a role.", 400, "role");
  if (role === "admin" && ctx.role !== "owner") throw forbidden("Only the owner can invite admins.");

  const existingUser = await User.findOne({ email }).select("_id").lean();
  if (existingUser && (await Member.exists({ workspaceId: ctx.workspaceId, userId: existingUser._id }))) {
    throw new AppError("ALREADY_MEMBER", "This person is already in the workspace.", 409, "email");
  }

  const token = randomToken();
  await Invite.deleteMany({ workspaceId: ctx.workspaceId, email, acceptedAt: null });
  await Invite.create({
    workspaceId: ctx.workspaceId,
    email,
    role,
    tokenHash: sha256(token),
    invitedBy: ctx.userId,
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
  });
  const [inviter, workspace] = await Promise.all([User.findById(ctx.userId).select("name").lean(), Workspace.findById(ctx.workspaceId).select("name").lean()]);
  await sendEmail({
    to: email,
    subject: `${inviter?.name ?? "Someone"} invited you to ${workspace?.name ?? "a workspace"} on Prasaar`,
    lines: [`${inviter?.name ?? "A teammate"} invited you to join ${workspace?.name} on Prasaar as ${role}.`, "The invite works for 7 days."],
    action: { label: "Accept invite", url: `${appUrl()}/invite/${token}` },
  });
  await AuditLog.create({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "team.invite", target: email, data: { role } });
}

export async function revokeInvite(ctx: Ctx, inviteId: string) {
  assertCan(ctx, "team:manage");
  await db();
  await Invite.deleteOne({ _id: inviteId, workspaceId: ctx.workspaceId });
}

export async function getInvite(token: string) {
  await db();
  const invite = await Invite.findOne({ tokenHash: sha256(token), acceptedAt: null, expiresAt: { $gt: new Date() } }).lean();
  if (!invite) return null;
  const workspace = await Workspace.findById(invite.workspaceId).select("name").lean();
  return { email: invite.email, role: invite.role as Role, workspaceName: workspace?.name ?? "a workspace", workspaceId: invite.workspaceId.toString() };
}

/** The invite is tied to an email address; only that account can accept it. */
export async function acceptInvite(userId: Types.ObjectId, token: string) {
  await db();
  const user = await User.findById(userId).select("email").lean();
  const invite = await Invite.findOne({ tokenHash: sha256(token), acceptedAt: null, expiresAt: { $gt: new Date() } });
  if (!user || !invite) throw new AppError("INVITE_INVALID", "This invite is invalid or has expired.");
  if (invite.email !== user.email) throw new AppError("INVITE_WRONG_ACCOUNT", `This invite is for ${invite.email}. Log in with that email to accept it.`, 403);
  await Member.updateOne(
    { workspaceId: invite.workspaceId, userId },
    { $setOnInsert: { role: invite.role } },
    { upsert: true },
  );
  invite.acceptedAt = new Date();
  await invite.save();
  await User.updateOne({ _id: userId }, { lastWorkspaceId: invite.workspaceId });
  return invite.workspaceId.toString();
}

export async function changeRole(ctx: Ctx, memberId: string, role: Role) {
  assertCan(ctx, "team:manage");
  await db();
  if (!ROLES.includes(role) || role === "owner") throw new AppError("INVALID_ROLE", "Pick a role.", 400);
  const member = await Member.findOne({ _id: memberId, workspaceId: ctx.workspaceId });
  if (!member) throw notFound("Member");
  if (member.role === "owner") throw forbidden("The owner's role can't be changed.");
  if ((role === "admin" || member.role === "admin") && ctx.role !== "owner") throw forbidden("Only the owner can change admins.");
  member.role = role;
  await member.save();
  await AuditLog.create({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "team.role", target: memberId, data: { role } });
}

export async function removeMember(ctx: Ctx, memberId: string) {
  await db();
  const member = await Member.findOne({ _id: memberId, workspaceId: ctx.workspaceId });
  if (!member) throw notFound("Member");
  const self = member.userId.equals(ctx.userId);
  if (!self) assertCan(ctx, "team:manage");
  if (member.role === "owner") throw forbidden("The owner can't be removed.");
  if (member.role === "admin" && !self && ctx.role !== "owner") throw forbidden("Only the owner can remove admins.");
  await member.deleteOne();
  await AuditLog.create({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "team.remove", target: memberId });
}

export async function updateProfile(userId: Types.ObjectId, input: { name?: string; locale?: string; timezone?: string; notifyPostFailed?: boolean; notifyTokenExpiring?: boolean }) {
  await db();
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim().slice(0, 80);
    if (!name) throw new AppError("NAME_REQUIRED", "Enter your name.", 400, "name");
    set.name = name;
  }
  if (input.locale !== undefined) set.locale = input.locale === "hi" ? "hi" : "en";
  if (input.timezone !== undefined && TIMEZONES.includes(input.timezone)) set.timezone = input.timezone;
  if (input.notifyPostFailed !== undefined) set["notify.postFailed"] = input.notifyPostFailed;
  if (input.notifyTokenExpiring !== undefined) set["notify.tokenExpiring"] = input.notifyTokenExpiring;
  await User.updateOne({ _id: userId }, set);
}
