"use server";

import { refresh } from "next/cache";
import { toActionResult } from "@/lib/errors";
import { requireCtx } from "@/lib/session";
import { deletePostGroup, retryPost, savePostGroup, type PostInput } from "@/lib/services/posts";

export async function savePostAction(input: PostInput, id?: string) {
  const ctx = await requireCtx();
  return toActionResult(async () => {
    const group = await savePostGroup(ctx, input, { id, source: "dashboard" });
    return { id: group.id, status: group.status, scheduledAt: group.scheduledAt };
  });
}

export async function deletePostAction(id: string) {
  const ctx = await requireCtx();
  return toActionResult(() => deletePostGroup(ctx, id));
}

export async function retryPostAction(postId: string) {
  const ctx = await requireCtx();
  const res = await toActionResult(() => retryPost(ctx, postId));
  if (res.ok) refresh();
  return res;
}
