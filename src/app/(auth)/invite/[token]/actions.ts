"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, WORKSPACE_COOKIE } from "@/lib/session";
import { acceptInvite } from "@/lib/services/team";

export async function acceptInviteAction(form: FormData) {
  const user = await requireUser();
  const workspaceId = await acceptInvite(user._id, String(form.get("token") ?? ""));
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/home");
}
