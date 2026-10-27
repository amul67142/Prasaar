"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { toActionResult } from "@/lib/errors";
import type { Role } from "@/lib/permissions";
import { requireCtx } from "@/lib/session";
import { changeRole, inviteMember, removeMember, revokeInvite } from "@/lib/services/team";

export async function inviteAction(email: string, role: Role) {
  const ctx = await requireCtx();
  const res = await toActionResult(() => inviteMember(ctx, email, role));
  if (res.ok) refresh();
  return res;
}

export async function revokeInviteAction(id: string) {
  const ctx = await requireCtx();
  const res = await toActionResult(() => revokeInvite(ctx, id));
  if (res.ok) refresh();
  return res;
}

export async function changeRoleAction(memberId: string, role: Role) {
  const ctx = await requireCtx();
  const res = await toActionResult(() => changeRole(ctx, memberId, role));
  if (res.ok) refresh();
  return res;
}

export async function removeMemberAction(memberId: string, self: boolean) {
  const ctx = await requireCtx();
  const res = await toActionResult(() => removeMember(ctx, memberId));
  if (!res.ok) return res;
  if (self) redirect("/home");
  refresh();
  return res;
}
