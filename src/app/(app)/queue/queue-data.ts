import "server-only";
import { db } from "@/lib/db/mongo";
import { Post, PostGroup } from "@/lib/db/models";
import type { Ctx } from "@/lib/session";
import type { ChannelView } from "@/lib/services/channels";
import { addDaysYmd, formatInTz, weekdayOfYmd, ymd, zonedToUtc } from "@/lib/time";

export interface UpcomingPost {
  postGroupId: string;
  scheduledAt: string;
  label: string;
  snippet: string;
}

export interface QueueOverview {
  freeSlots: { at: string; label: string }[];
  upcoming: UpcomingPost[];
}

const WEEK_MS = 7 * 86_400_000;

/**
 * For each channel: the next `n` weekly slots nobody has taken yet, and what's already
 * scheduled in the next 7 days. Mirrors the rules of nextQueueSlot in services/posts.ts.
 */
export async function queueOverview(ctx: Ctx, channels: ChannelView[], n = 5): Promise<Record<string, QueueOverview>> {
  await db();
  const now = Date.now();
  const posts = await Post.find({
    workspaceId: ctx.workspaceId,
    channelId: { $in: channels.map((c) => c.id) },
    status: { $in: ["scheduled", "retrying"] },
    scheduledAt: { $gte: new Date(now) },
  })
    .select("channelId postGroupId scheduledAt")
    .sort({ scheduledAt: 1 })
    .lean();

  const soonGroupIds = [...new Set(posts.filter((p) => p.scheduledAt!.getTime() < now + WEEK_MS).map((p) => p.postGroupId.toString()))];
  const groups = await PostGroup.find({ _id: { $in: soonGroupIds }, workspaceId: ctx.workspaceId }).select("content").lean();
  const snippetOf = new Map(groups.map((g) => [g._id.toString(), (g.content ?? "").slice(0, 100)]));

  const takenBy = new Map<string, Set<number>>();
  for (const p of posts) {
    const key = p.channelId.toString();
    if (!takenBy.has(key)) takenBy.set(key, new Set());
    takenBy.get(key)!.add(p.scheduledAt!.getTime());
  }

  const today = ymd(new Date(now), ctx.timezone);
  const label = (d: Date) => formatInTz(d, ctx.timezone, "EEE d MMM, h:mm a");
  const result: Record<string, QueueOverview> = {};

  for (const c of channels) {
    const taken = takenBy.get(c.id) ?? new Set<number>();
    const byDay = new Map<number, string[]>();
    for (const s of c.slots) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s.time].sort());

    const freeSlots: QueueOverview["freeSlots"] = [];
    for (let i = 0; i < 90 && freeSlots.length < n && byDay.size > 0; i++) {
      const date = addDaysYmd(today, i);
      for (const time of byDay.get(weekdayOfYmd(date)) ?? []) {
        const at = zonedToUtc(date, time, ctx.timezone);
        if (at.getTime() <= now + 60_000 || taken.has(at.getTime())) continue;
        freeSlots.push({ at: at.toISOString(), label: label(at) });
        if (freeSlots.length >= n) break;
      }
    }

    const upcoming = posts
      .filter((p) => p.channelId.toString() === c.id && p.scheduledAt!.getTime() < now + WEEK_MS)
      .map((p) => ({
        postGroupId: p.postGroupId.toString(),
        scheduledAt: p.scheduledAt!.toISOString(),
        label: label(p.scheduledAt!),
        snippet: snippetOf.get(p.postGroupId.toString()) ?? "",
      }));

    result[c.id] = { freeSlots, upcoming };
  }
  return result;
}
