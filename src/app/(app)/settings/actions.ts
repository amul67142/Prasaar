"use server";

import { refresh } from "next/cache";
import { toActionResult } from "@/lib/errors";
import { requireCtx } from "@/lib/session";
import { updateProfile, updateWorkspace } from "@/lib/services/team";

export async function updateWorkspaceAction(input: { name?: string; timezone?: string }) {
  const ctx = await requireCtx();
  const res = await toActionResult(() => updateWorkspace(ctx, input));
  if (res.ok) refresh();
  return res;
}

export async function updateProfileAction(input: { name?: string; locale?: string; notifyPostFailed?: boolean; notifyTokenExpiring?: boolean }) {
  const ctx = await requireCtx();
  const res = await toActionResult(() => updateProfile(ctx.userId, input));
  if (res.ok) refresh();
  return res;
}
