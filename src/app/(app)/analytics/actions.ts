"use server";

import { refresh } from "next/cache";
import { toActionResult } from "@/lib/errors";
import { requireCtx } from "@/lib/session";
import { refreshAnalytics } from "@/lib/services/analytics";

export async function refreshAnalyticsAction() {
  const ctx = await requireCtx();
  const res = await toActionResult(() => refreshAnalytics(ctx));
  if (res.ok) refresh();
  return res;
}
