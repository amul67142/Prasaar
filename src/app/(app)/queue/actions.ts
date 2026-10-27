"use server";

import { refresh } from "next/cache";
import { toActionResult } from "@/lib/errors";
import { requireCtx } from "@/lib/session";
import { updateSlots } from "@/lib/services/channels";

type Slot = { day: number; time: string };

export async function saveSlotsAction(channelId: string, slots: Slot[]) {
  const ctx = await requireCtx();
  const result = await toActionResult(async () => {
    await updateSlots(ctx, channelId, slots);
  });
  if (result.ok) refresh();
  return result;
}

/** Applies one set of times to several accounts at once. */
export async function copySlotsAction(channelIds: string[], slots: Slot[]) {
  const ctx = await requireCtx();
  const result = await toActionResult(async () => {
    for (const id of channelIds) await updateSlots(ctx, id, slots);
  });
  if (result.ok) refresh();
  return result;
}
