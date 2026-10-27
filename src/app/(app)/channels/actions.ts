"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { AppError, toActionResult } from "@/lib/errors";
import { getAdapter } from "@/lib/platforms";
import { connectBluesky } from "@/lib/platforms/connect/bluesky";
import { connectTelegram } from "@/lib/platforms/connect/telegram";
import { PlatformError } from "@/lib/platforms/types";
import { assertCan, requireCtx } from "@/lib/session";
import { confirmPendingConnection, getChannelDoc, markChannel, removeChannel, toAdapterChannel } from "@/lib/services/channels";

export async function connectTelegramAction(input: { botToken: string; chatId: string }) {
  const ctx = await requireCtx();
  const res = await toActionResult(() => connectTelegram(ctx, { botToken: input.botToken.trim(), chatId: input.chatId.trim() }));
  if (res.ok) refresh();
  return res;
}

export async function connectBlueskyAction(input: { identifier: string; appPassword: string; service?: string }) {
  const ctx = await requireCtx();
  const res = await toActionResult(() =>
    connectBluesky(ctx, { identifier: input.identifier.trim().replace(/^@/, ""), appPassword: input.appPassword.trim(), service: input.service?.trim() || undefined }),
  );
  if (res.ok) refresh();
  return res;
}

export async function removeChannelAction(id: string) {
  const ctx = await requireCtx();
  const res = await toActionResult(() => removeChannel(ctx, id));
  if (res.ok) refresh();
  return res;
}

/** Proves the stored credentials still work, and updates the account's status. */
export async function testChannelAction(id: string) {
  const ctx = await requireCtx();
  const res = await toActionResult(async () => {
    assertCan(ctx, "channel:manage");
    const doc = await getChannelDoc(ctx, id);
    try {
      await getAdapter(doc.platform as never).check(toAdapterChannel(doc));
      if (doc.status !== "active") await markChannel(doc._id, "active");
      return { ok: true as const };
    } catch (err) {
      if (err instanceof PlatformError) {
        if (err.authFailed) await markChannel(doc._id, "expired", err.message);
        throw new AppError(err.code, err.message);
      }
      throw err;
    }
  });
  refresh();
  return res;
}

export async function confirmConnectionAction(pendingId: string, keys: string[]) {
  const ctx = await requireCtx();
  const res = await toActionResult(() => confirmPendingConnection(ctx, pendingId, keys));
  if (!res.ok) return res;
  redirect(`/channels?connected=${res.data.length}`);
}
