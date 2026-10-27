import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { db } from "./db/mongo";
import { Member, User, Workspace, Types } from "./db/models";
import { AppError, forbidden, unauthorized } from "./errors";
import { can, type Action, type Role } from "./permissions";

export const WORKSPACE_COOKIE = "prasaar_ws";

/** Everything a service needs to act for a user inside one workspace. */
export interface Ctx {
  userId: Types.ObjectId;
  workspaceId: Types.ObjectId;
  role: Role;
  timezone: string;
}

export const currentUser = cache(async () => {
  // Auth.js touches crypto before it reads cookies; mark this as request-time first
  // so Next.js doesn't see a random value during prerendering.
  await connection();
  const session = await auth();
  const id = session?.user?.id;
  if (!id || !Types.ObjectId.isValid(id)) return null;
  await db();
  return User.findById(id).lean();
});

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Resolves the active workspace from the cookie (falling back to the last one used)
 * and checks membership. Used by pages and server actions.
 */
export const requireCtx = cache(async (): Promise<Ctx> => {
  const user = await currentUser();
  if (!user) redirect("/login");
  const store = await cookies();
  const wanted = store.get(WORKSPACE_COOKIE)?.value;

  let member = null;
  if (wanted && Types.ObjectId.isValid(wanted)) member = await Member.findOne({ userId: user._id, workspaceId: wanted }).lean();
  if (!member && user.lastWorkspaceId) member = await Member.findOne({ userId: user._id, workspaceId: user.lastWorkspaceId }).lean();
  member ??= await Member.findOne({ userId: user._id }).sort({ createdAt: 1 }).lean();
  if (!member) redirect("/onboarding");

  const workspace = await Workspace.findById(member.workspaceId).select("timezone").lean();
  return {
    userId: user._id,
    workspaceId: member.workspaceId,
    role: member.role as Role,
    timezone: workspace?.timezone ?? "Asia/Kolkata",
  };
});

/** For route handlers: same as requireCtx but throws instead of redirecting. */
export async function ctxOrThrow(): Promise<Ctx> {
  const user = await currentUser();
  if (!user) throw unauthorized();
  return requireCtx();
}

export function assertCan(ctx: Ctx, action: Action) {
  if (!can(ctx.role, action)) throw forbidden();
}

export function objectId(id: string, what = "id"): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw new AppError("INVALID_ID", `Invalid ${what}`, 400);
  return new Types.ObjectId(id);
}
