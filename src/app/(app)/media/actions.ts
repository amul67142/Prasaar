"use server";

import { refresh } from "next/cache";
import { toActionResult } from "@/lib/errors";
import { requireCtx } from "@/lib/session";
import { completeUpload, createUpload, deleteMedia, listMedia, moveMedia } from "@/lib/services/media";
import type { MediaKind } from "@/lib/platforms/rules";

export async function startUploadAction(input: { filename: string; mime: string; sizeBytes: number; folder?: string }) {
  const ctx = await requireCtx();
  return toActionResult(() => createUpload(ctx, input));
}

export async function finishUploadAction(mediaId: string) {
  const ctx = await requireCtx();
  return toActionResult(() => completeUpload(ctx, mediaId));
}

export async function listMediaAction(opts: { folder?: string; kind?: MediaKind; before?: string }) {
  const ctx = await requireCtx();
  return toActionResult(() => listMedia(ctx, opts));
}

export async function deleteMediaAction(mediaId: string) {
  const ctx = await requireCtx();
  const res = await toActionResult(() => deleteMedia(ctx, mediaId));
  if (res.ok) refresh();
  return res;
}

export async function moveMediaAction(mediaId: string, folder: string) {
  const ctx = await requireCtx();
  const res = await toActionResult(() => moveMedia(ctx, mediaId, folder));
  if (res.ok) refresh();
  return res;
}
