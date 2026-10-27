"use server";

import { refresh } from "next/cache";
import { toActionResult } from "@/lib/errors";
import { requireCtx } from "@/lib/session";
import { reschedulePostGroup } from "@/lib/services/posts";

export async function reschedulePostAction(id: string, scheduledAt: string) {
  const ctx = await requireCtx();
  const result = await toActionResult(async () => {
    await reschedulePostGroup(ctx, id, scheduledAt);
  });
  if (result.ok) refresh();
  return result;
}
