import "server-only";
import { z } from "zod";
import { db } from "../db/mongo";
import {
  AuditLog,
  Channel,
  Media,
  Post,
  PostGroup,
  PostLog,
  Workspace,
  Types,
  type ChannelDoc,
  type GroupStatus,
  type MediaDoc,
  type PostDoc,
  type PostGroupDoc,
  type PostStatus,
} from "../db/models";
import { AppError, notFound } from "../errors";
import { planLimits } from "../plans";
import { assertCan, type Ctx } from "../session";
import { PLATFORMS, type Platform } from "../platforms/catalog";
import {
  validatePost,
  YOUTUBE_CATEGORY_IDS,
  YOUTUBE_TAGS_MAX,
  YOUTUBE_THUMBNAIL,
  YOUTUBE_TITLE_MAX,
  youtubeTagsLength,
  type Issue,
  type PostFormat,
} from "../platforms/rules";
import { after } from "next/server";
import { enqueuePublish, queueEnabled } from "../queue";
import { addDaysYmd, weekdayOfYmd, ymd, zonedToUtc } from "../time";
import { loadPostMedia, toMediaView, type MediaView } from "./media";
import { METRIC_KEYS, type MetricKey } from "../platforms/analytics-info";

const override = z.object({
  content: z.string().max(70000).optional(),
  firstComment: z.string().max(5000).optional(),
  format: z.enum(["feed", "reel", "story"]).optional(),
  title: z.string().trim().max(YOUTUBE_TITLE_MAX).optional(),
  privacy: z.enum(["public", "unlisted", "private"]).optional(),
  madeForKids: z.boolean().optional(),
  // The rest are YouTube-only too.
  tags: z
    .array(z.string().trim().min(1).max(100))
    .max(100)
    .refine((t) => youtubeTagsLength(t) <= YOUTUBE_TAGS_MAX, `Tags can add up to ${YOUTUBE_TAGS_MAX} characters.`)
    .optional(),
  categoryId: z.enum(YOUTUBE_CATEGORY_IDS).optional(),
  aiContent: z.boolean().optional(),
  paidPromotion: z.boolean().optional(),
  notifySubscribers: z.boolean().optional(),
  embeddable: z.boolean().optional(),
  thumbnailId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  playlistId: z.string().regex(/^[A-Za-z0-9_-]{2,64}$/).optional(),
  /** The YouTube channel the playlist belongs to, and its title for showing it again when editing. */
  playlistChannelId: z.string().max(64).optional(),
  playlistTitle: z.string().max(200).optional(),
});
export type PlatformOverride = z.infer<typeof override>;

export const postInputSchema = z.object({
  content: z.string().max(70000).default(""),
  channelIds: z.array(z.string()).max(200).default([]),
  mediaIds: z.array(z.string()).max(20).default([]),
  firstComment: z.string().max(5000).optional(),
  perPlatform: z.partialRecord(z.enum(PLATFORMS), override).default({}),
  when: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("draft") }),
    z.object({ mode: z.literal("now") }),
    z.object({ mode: z.literal("queue") }),
    z.object({ mode: z.literal("schedule"), scheduledAt: z.iso.datetime({ offset: true }) }),
  ]),
});
export type PostInput = z.input<typeof postInputSchema>;

export interface PostView {
  id: string;
  channelId: string;
  platform: Platform;
  status: PostStatus;
  scheduledAt?: string;
  publishedAt?: string;
  permalink?: string;
  attempts: number;
  lastError?: { code?: string; message?: string };
  firstCommentStatus?: string;
  metrics?: Partial<Record<MetricKey, number>>;
  metricsAt?: string;
}

export interface PostGroupView {
  id: string;
  content: string;
  perPlatform: Partial<Record<Platform, z.infer<typeof override>>>;
  firstComment?: string;
  channelIds: string[];
  media: MediaView[];
  /** The custom thumbnail chosen for YouTube, if any. */
  youtubeThumbnail?: MediaView;
  scheduledAt?: string;
  status: GroupStatus;
  source: string;
  createdAt: string;
  updatedAt: string;
  posts: PostView[];
}

export interface ChannelIssues {
  channelId: string;
  platform: Platform;
  displayName: string;
  issues: Issue[];
}

const EDITABLE: GroupStatus[] = ["draft", "scheduled", "failed"];
const UNDELIVERED: PostStatus[] = ["draft", "scheduled", "retrying", "failed", "cancelled"];

function toPostView(p: PostDoc): PostView {
  return {
    id: p._id.toString(),
    channelId: p.channelId.toString(),
    platform: p.platform as Platform,
    status: p.status as PostStatus,
    scheduledAt: p.scheduledAt?.toISOString(),
    publishedAt: p.publishedAt?.toISOString(),
    permalink: p.permalink ?? undefined,
    attempts: p.attempts ?? 0,
    lastError: p.lastError?.message ? { code: p.lastError.code ?? undefined, message: p.lastError.message } : undefined,
    firstCommentStatus: p.firstCommentStatus ?? undefined,
    metrics: p.metricsAt
      ? (Object.fromEntries(METRIC_KEYS.filter((k) => typeof p.metrics?.[k] === "number").map((k) => [k, p.metrics![k]])) as PostView["metrics"])
      : undefined,
    metricsAt: p.metricsAt?.toISOString(),
  };
}

function toGroupView(g: PostGroupDoc, media: MediaDoc[], posts: PostDoc[], youtubeThumbnail?: MediaDoc): PostGroupView {
  const ts = g as PostGroupDoc & { createdAt: Date; updatedAt: Date };
  return {
    id: g._id.toString(),
    content: g.content ?? "",
    perPlatform: (g.perPlatform ?? {}) as PostGroupView["perPlatform"],
    firstComment: g.firstComment ?? undefined,
    channelIds: (g.channelIds ?? []).map(String),
    media: media.map(toMediaView),
    youtubeThumbnail: youtubeThumbnail ? toMediaView(youtubeThumbnail) : undefined,
    scheduledAt: g.scheduledAt?.toISOString(),
    status: g.status as GroupStatus,
    source: g.source ?? "dashboard",
    createdAt: ts.createdAt.toISOString(),
    updatedAt: ts.updatedAt.toISOString(),
    posts: posts.map(toPostView),
  };
}

/** Validates the post against every chosen channel's rules. Shared by save and the composer preview. */
export function checkAgainstChannels(input: z.infer<typeof postInputSchema>, channels: ChannelDoc[], media: MediaDoc[]): ChannelIssues[] {
  return channels.map((c) => {
    const platform = c.platform as Platform;
    const o = input.perPlatform[platform] ?? {};
    const meta = (c.meta ?? {}) as { maxChars?: number };
    return {
      channelId: c._id.toString(),
      platform,
      displayName: c.displayName,
      issues: validatePost({
        platform,
        text: o.content ?? input.content,
        format: (o.format ?? "feed") as PostFormat,
        maxCharsOverride: meta.maxChars,
        media: media.map((m) => ({
          kind: m.kind as MediaView["kind"],
          mime: m.mime,
          sizeBytes: m.sizeBytes,
          width: m.width,
          height: m.height,
          durationSec: m.durationSec,
          filename: m.filename,
        })),
      }),
    };
  });
}

async function loadChannels(ctx: Ctx, ids: string[]): Promise<ChannelDoc[]> {
  const unique = [...new Set(ids)];
  if (unique.some((id) => !Types.ObjectId.isValid(id))) throw new AppError("INVALID_ID", "Invalid channel id", 400, "channelIds");
  const docs = (await Channel.find({ _id: { $in: unique }, workspaceId: ctx.workspaceId }).lean()) as ChannelDoc[];
  if (docs.length !== unique.length) throw new AppError("CHANNEL_NOT_FOUND", "One of the chosen accounts isn't in this workspace.", 400, "channelIds");
  const order = new Map(unique.map((id, i) => [id, i]));
  return docs.sort((a, b) => order.get(a._id.toString())! - order.get(b._id.toString())!);
}

async function resolveTime(ctx: Ctx, when: z.infer<typeof postInputSchema>["when"], channels: ChannelDoc[]): Promise<Date | null> {
  if (when.mode === "draft") return null;
  if (when.mode === "now") return new Date();
  if (when.mode === "queue") return nextQueueSlot(ctx, channels);

  const at = new Date(when.scheduledAt);
  if (at.getTime() < Date.now() - 60_000) throw new AppError("SCHEDULED_TIME_IN_PAST", "That time has already passed.", 400, "scheduledAt");
  const workspace = await Workspace.findById(ctx.workspaceId).select("planId").lean();
  const limits = planLimits(workspace?.planId);
  if (at.getTime() > Date.now() + limits.maxScheduleDays * 86_400_000) {
    throw new AppError("SCHEDULE_TOO_FAR", `Your plan lets you schedule up to ${limits.maxScheduleDays} days ahead.`, 400, "scheduledAt");
  }
  return at;
}

async function checkMonthlyLimit(ctx: Ctx, at: Date, excludeGroupId?: Types.ObjectId) {
  const workspace = await Workspace.findById(ctx.workspaceId).select("planId").lean();
  const limits = planLimits(workspace?.planId);
  if (!Number.isFinite(limits.postsPerMonth)) return;
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  const used = await PostGroup.countDocuments({
    workspaceId: ctx.workspaceId,
    status: { $ne: "draft" },
    scheduledAt: { $gte: start, $lt: end },
    ...(excludeGroupId ? { _id: { $ne: excludeGroupId } } : {}),
  });
  if (used >= limits.postsPerMonth) {
    throw new AppError("POST_LIMIT", `Your ${limits.name} plan includes ${limits.postsPerMonth} posts a month.`, 402);
  }
}

/** Creates or replaces the per-channel deliveries and queues them. */
async function fanOut(group: PostGroupDoc, channels: ChannelDoc[], at: Date) {
  const posts = await Post.insertMany(
    channels.map((c) => ({
      postGroupId: group._id,
      workspaceId: group.workspaceId,
      channelId: c._id,
      platform: c.platform,
      status: "scheduled",
      scheduledAt: at,
    })),
  );
  await Promise.all(
    posts.map(async (p) => {
      const messageId = await enqueuePublish(p._id.toString(), at);
      if (messageId) await Post.updateOne({ _id: p._id }, { queueMessageId: messageId });
    }),
  );

  // Without a queue, "publish now" would wait for the next sweep: publish right after the response.
  if (!queueEnabled() && at.getTime() <= Date.now() + 15_000) {
    try {
      after(async () => {
        const { publishPost } = await import("../engine");
        for (const p of posts) await publishPost(p._id.toString());
      });
    } catch {
      // Not inside a request (scripts, tests): the sweep publishes instead.
    }
  }
}

export async function savePostGroup(ctx: Ctx, rawInput: PostInput, opts: { id?: string; source?: "dashboard" | "api" | "mcp" } = {}) {
  assertCan(ctx, "post:write");
  const input = postInputSchema.parse(rawInput);
  await db();

  let group: (PostGroupDoc & { save(): Promise<unknown> }) | null = null;
  if (opts.id) {
    group = await PostGroup.findOne({ _id: opts.id, workspaceId: ctx.workspaceId });
    if (!group) throw notFound("Post");
    if (!EDITABLE.includes(group.status as GroupStatus)) {
      throw new AppError("POST_NOT_EDITABLE", "Posts can only be edited while they're drafts or scheduled.", 409);
    }
    if (await Post.exists({ postGroupId: group._id, status: { $in: ["publishing", "published"] } })) {
      throw new AppError("POST_NOT_EDITABLE", "This post has already started publishing.", 409);
    }
  }

  const isDraft = input.when.mode === "draft";
  if (!isDraft) assertCan(ctx, "post:publish");
  if (!isDraft && input.channelIds.length === 0) throw new AppError("NO_CHANNELS", "Pick at least one account to post to.", 400, "channelIds");

  const channels = await loadChannels(ctx, input.channelIds);
  const media = await loadPostMedia(ctx.workspaceId, input.mediaIds);
  const thumbId = input.perPlatform.youtube?.thumbnailId;
  if (thumbId) {
    const [thumb] = await loadPostMedia(ctx.workspaceId, [thumbId]);
    if (!(YOUTUBE_THUMBNAIL.mimes as readonly string[]).includes(thumb.mime) || thumb.sizeBytes > YOUTUBE_THUMBNAIL.maxBytes) {
      throw new AppError("THUMBNAIL_INVALID", "YouTube thumbnails must be a JPEG or PNG under 2 MB.", 400, "thumbnail");
    }
  }

  if (!isDraft) {
    const inactive = channels.find((c) => c.status !== "active");
    if (inactive) throw new AppError("CHANNEL_NOT_ACTIVE", `${inactive.displayName} needs to be reconnected before posting.`, 400, "channelIds");
    const results = checkAgainstChannels(input, channels, media);
    const bad = results.filter((r) => r.issues.some((i) => i.severity === "error"));
    if (bad.length) {
      const first = bad[0].issues.find((i) => i.severity === "error")!;
      throw new AppError("VALIDATION_FAILED", `${bad[0].displayName}: ${first.message}`, 422, first.field, results);
    }
  }

  const at = await resolveTime(ctx, input.when, channels);
  if (at) await checkMonthlyLimit(ctx, at, group?._id);

  const fields = {
    content: input.content,
    perPlatform: input.perPlatform,
    firstComment: input.firstComment || undefined,
    mediaIds: media.map((m) => m._id),
    channelIds: channels.map((c) => c._id),
    scheduledAt: at ?? (group?.scheduledAt && isDraft ? group.scheduledAt : undefined),
    status: (isDraft ? "draft" : "scheduled") as GroupStatus,
  };

  if (group) {
    await Post.deleteMany({ postGroupId: group._id, status: { $in: UNDELIVERED } });
    Object.assign(group, fields);
    await group.save();
  } else {
    group = await PostGroup.create({ ...fields, workspaceId: ctx.workspaceId, createdBy: ctx.userId, source: opts.source ?? "dashboard" });
  }

  if (at) await fanOut(group as PostGroupDoc, channels, at);
  await AuditLog.create({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: opts.id ? "post.update" : "post.create", target: group._id.toString() });
  return getPostGroup(ctx, group._id.toString());
}

/** Calendar drag-and-drop: move a scheduled post to a new time. */
export async function reschedulePostGroup(ctx: Ctx, id: string, scheduledAt: string) {
  assertCan(ctx, "post:publish");
  await db();
  const group = await PostGroup.findOne({ _id: id, workspaceId: ctx.workspaceId });
  if (!group) throw notFound("Post");
  const at = new Date(scheduledAt);
  if (Number.isNaN(at.getTime())) throw new AppError("INVALID_TIME", "Invalid time.", 400, "scheduledAt");

  if (group.status === "draft") {
    group.scheduledAt = at; // Drafts just remember a planned time.
    await group.save();
    return getPostGroup(ctx, id);
  }
  if (group.status !== "scheduled") throw new AppError("POST_NOT_EDITABLE", "Only scheduled posts can be moved.", 409);
  await resolveTime(ctx, { mode: "schedule", scheduledAt: at.toISOString() }, []);

  group.scheduledAt = at;
  await group.save();
  const posts = await Post.find({ postGroupId: group._id, status: "scheduled" });
  for (const p of posts) {
    p.scheduledAt = at;
    p.queueMessageId = (await enqueuePublish(p._id.toString(), at)) ?? undefined;
    await p.save();
  }
  return getPostGroup(ctx, id);
}

export async function deletePostGroup(ctx: Ctx, id: string) {
  assertCan(ctx, "post:write");
  await db();
  const group = await PostGroup.findOne({ _id: id, workspaceId: ctx.workspaceId });
  if (!group) throw notFound("Post");
  if (await Post.exists({ postGroupId: group._id, status: "publishing" })) {
    throw new AppError("POST_PUBLISHING", "This post is publishing right now. Try again in a minute.", 409);
  }
  const delivered = await Post.exists({ postGroupId: group._id, status: "published" });
  if (delivered) {
    // Keep the record of what went out; cancel what hasn't.
    await Post.updateMany({ postGroupId: group._id, status: { $in: ["scheduled", "retrying"] } }, { status: "cancelled" });
    await refreshGroupStatus(group._id);
  } else {
    await Post.deleteMany({ postGroupId: group._id });
    await group.deleteOne();
  }
  await AuditLog.create({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "post.delete", target: id });
}

export async function retryPost(ctx: Ctx, postId: string) {
  assertCan(ctx, "post:publish");
  await db();
  const post = await Post.findOne({ _id: postId, workspaceId: ctx.workspaceId });
  if (!post) throw notFound("Post");
  if (post.status !== "failed") throw new AppError("NOT_FAILED", "Only failed posts can be retried.", 409);
  const channel = await Channel.findById(post.channelId).select("status displayName").lean();
  if (!channel || channel.status !== "active") throw new AppError("CHANNEL_NOT_ACTIVE", "Reconnect this account first, then retry.", 409);
  const now = new Date();
  Object.assign(post, { status: "scheduled", scheduledAt: now, attempts: 0, nextAttemptAt: undefined, lastError: undefined });
  await post.save();
  await PostGroup.updateOne({ _id: post.postGroupId }, { status: "publishing" });
  await enqueuePublish(post._id.toString(), now);
}

export async function getPostGroup(ctx: Ctx, id: string): Promise<PostGroupView> {
  await db();
  if (!Types.ObjectId.isValid(id)) throw notFound("Post");
  const group = (await PostGroup.findOne({ _id: id, workspaceId: ctx.workspaceId }).lean()) as PostGroupDoc | null;
  if (!group) throw notFound("Post");
  const thumbId = (group.perPlatform as PostGroupView["perPlatform"] | undefined)?.youtube?.thumbnailId;
  const [media, posts, thumb] = await Promise.all([
    Media.find({ _id: { $in: group.mediaIds }, workspaceId: ctx.workspaceId }).lean(),
    Post.find({ postGroupId: group._id }).sort({ createdAt: 1 }).lean(),
    thumbId ? Media.findOne({ _id: thumbId, workspaceId: ctx.workspaceId }).lean() : null,
  ]);
  const byId = new Map(media.map((m) => [m._id.toString(), m as MediaDoc]));
  const ordered = group.mediaIds.map((m) => byId.get(m.toString())).filter(Boolean) as MediaDoc[];
  return toGroupView(group, ordered, posts as PostDoc[], (thumb as MediaDoc | null) ?? undefined);
}

export async function getPostLogs(ctx: Ctx, groupId: string) {
  await db();
  const posts = await Post.find({ postGroupId: groupId, workspaceId: ctx.workspaceId }).select("_id").lean();
  const logs = await PostLog.find({ postId: { $in: posts.map((p) => p._id) } }).sort({ createdAt: -1 }).limit(200).lean();
  return logs.map((l) => ({
    id: l._id.toString(),
    postId: l.postId.toString(),
    level: l.level,
    message: l.message,
    createdAt: l.createdAt.toISOString(),
  }));
}

export interface CalendarItem {
  id: string;
  snippet: string;
  scheduledAt: string;
  status: GroupStatus;
  channelIds: string[];
  platforms: Platform[];
  thumb?: string;
}

export async function listCalendar(
  ctx: Ctx,
  opts: { from: Date; to: Date; channelId?: string; status?: GroupStatus },
): Promise<CalendarItem[]> {
  await db();
  const filter: Record<string, unknown> = { workspaceId: ctx.workspaceId, scheduledAt: { $gte: opts.from, $lt: opts.to } };
  if (opts.status) filter.status = opts.status;
  if (opts.channelId && Types.ObjectId.isValid(opts.channelId)) filter.channelIds = new Types.ObjectId(opts.channelId);
  const groups = (await PostGroup.find(filter).sort({ scheduledAt: 1 }).limit(1000).lean()) as PostGroupDoc[];
  const channelIds = [...new Set(groups.flatMap((g) => g.channelIds.map(String)))];
  const firstMedia = [...new Set(groups.map((g) => g.mediaIds[0]?.toString()).filter(Boolean))] as string[];
  const [channels, media] = await Promise.all([
    Channel.find({ _id: { $in: channelIds } }).select("platform").lean(),
    Media.find({ _id: { $in: firstMedia } }).select("url kind").lean(),
  ]);
  const platformOf = new Map(channels.map((c) => [c._id.toString(), c.platform as Platform]));
  const mediaOf = new Map(media.map((m) => [m._id.toString(), m]));
  return groups.map((g) => {
    const thumb = g.mediaIds[0] ? mediaOf.get(g.mediaIds[0].toString()) : undefined;
    return {
      id: g._id.toString(),
      snippet: (g.content ?? "").slice(0, 140),
      scheduledAt: g.scheduledAt!.toISOString(),
      status: g.status as GroupStatus,
      channelIds: g.channelIds.map(String),
      platforms: [...new Set(g.channelIds.map((c) => platformOf.get(c.toString())).filter(Boolean))] as Platform[],
      thumb: thumb?.kind === "image" ? thumb.url : undefined,
    };
  });
}

export async function listDrafts(ctx: Ctx) {
  await db();
  const groups = await PostGroup.find({ workspaceId: ctx.workspaceId, status: "draft" }).sort({ updatedAt: -1 }).limit(100).lean();
  return groups.map((g) => ({
    id: g._id.toString(),
    snippet: (g.content ?? "").slice(0, 140),
    updatedAt: (g as unknown as { updatedAt: Date }).updatedAt.toISOString(),
    channelCount: g.channelIds.length,
  }));
}

export async function listRecentFailures(ctx: Ctx, limit = 10) {
  await db();
  const posts = await Post.find({ workspaceId: ctx.workspaceId, status: "failed" }).sort({ updatedAt: -1 }).limit(limit).lean();
  return posts.map((p) => ({
    postGroupId: p.postGroupId.toString(),
    channelId: p.channelId.toString(),
    platform: p.platform as Platform,
    message: p.lastError?.message ?? "Failed",
    at: (p as unknown as { updatedAt: Date }).updatedAt.toISOString(),
  }));
}

/** Rolls the per-channel statuses up into the group's status. */
export async function refreshGroupStatus(groupId: Types.ObjectId | string) {
  const posts = await Post.find({ postGroupId: groupId, status: { $ne: "cancelled" } }).select("status").lean();
  const s = posts.map((p) => p.status as PostStatus);
  let status: GroupStatus;
  if (s.length === 0) status = "failed";
  else if (s.every((x) => x === "scheduled")) status = "scheduled";
  else if (s.some((x) => x === "scheduled" || x === "publishing" || x === "retrying")) status = "publishing";
  else if (s.every((x) => x === "published")) status = "published";
  else if (s.some((x) => x === "published")) status = "partially_published";
  else status = "failed";
  await PostGroup.updateOne({ _id: groupId, status: { $ne: "draft" } }, { status });
  return status;
}

/** Earliest free weekly slot shared by all chosen channels (or any of them, if they share none). */
export async function nextQueueSlot(ctx: Ctx, channels: ChannelDoc[]): Promise<Date> {
  if (channels.length === 0) throw new AppError("NO_CHANNELS", "Pick at least one account to post to.", 400, "channelIds");
  const sets = channels.map((c) => new Set((c.slots ?? []).map((s) => `${s.day}-${s.time}`)));
  if (sets.every((s) => s.size === 0)) {
    throw new AppError("QUEUE_NO_SLOTS", "Set posting times for these accounts on the Queue page first.", 400);
  }
  const common = [...sets[0]].filter((k) => sets.every((s) => s.has(k)));
  const slotKeys = common.length ? common : [...new Set(sets.flatMap((s) => [...s]))];
  const byDay = new Map<number, string[]>();
  for (const k of slotKeys) {
    const [day, time] = k.split("-");
    byDay.set(Number(day), [...(byDay.get(Number(day)) ?? []), time].sort());
  }

  const taken = await Post.find({
    channelId: { $in: channels.map((c) => c._id) },
    status: { $in: ["scheduled", "retrying"] },
    scheduledAt: { $gte: new Date() },
  })
    .select("scheduledAt")
    .lean();
  const takenTimes = new Set(taken.map((p) => p.scheduledAt!.getTime()));

  const today = ymd(new Date(), ctx.timezone);
  const earliest = Date.now() + 60_000;
  for (let i = 0; i < 90; i++) {
    const date = addDaysYmd(today, i);
    for (const time of byDay.get(weekdayOfYmd(date)) ?? []) {
      const at = zonedToUtc(date, time, ctx.timezone);
      if (at.getTime() > earliest && !takenTimes.has(at.getTime())) return at;
    }
  }
  throw new AppError("QUEUE_FULL", "No free queue slot in the next 90 days. Add more posting times.", 400);
}
