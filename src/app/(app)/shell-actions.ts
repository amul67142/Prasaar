"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { db } from "@/lib/db/mongo";
import { Member, User } from "@/lib/db/models";
import { toActionResult } from "@/lib/errors";
import { objectId, requireUser, WORKSPACE_COOKIE } from "@/lib/session";
import { createWorkspace } from "@/lib/services/team";

async function setWorkspaceCookie(id: string) {
  (await cookies()).set(WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function switchWorkspaceAction(workspaceId: string) {
  const user = await requireUser();
  await db();
  const id = objectId(workspaceId, "workspace");
  if (!(await Member.exists({ userId: user._id, workspaceId: id }))) redirect("/home");
  await setWorkspaceCookie(workspaceId);
  await User.updateOne({ _id: user._id }, { lastWorkspaceId: id });
  redirect("/home");
}

export async function createWorkspaceAction(name: string) {
  const user = await requireUser();
  const result = await toActionResult(() => createWorkspace(user._id, name));
  if (!result.ok) return result;
  await setWorkspaceCookie(result.data);
  await User.updateOne({ _id: user._id }, { lastWorkspaceId: result.data });
  redirect("/channels");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
