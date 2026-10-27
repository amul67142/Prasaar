import "server-only";
import { db } from "../db/mongo";
import { Channel, Media, PostGroup, Types, type GroupStatus, type PostGroupDoc } from "../db/models";
import type { Ctx } from "../session";
import type { Platform } from "../platforms/catalog";

export const POST_TABS = ["drafts", "scheduled", "failed", "published"] as const;
export type PostTab = (typeof POST_TABS)[number];

interface TabQuery {
  statuses: GroupStatus[];
  field: "scheduledAt" | "updatedAt";
  dir: 1 | -1;
}

// Scheduled: soonest first. Everything else: most recent first.
const TABS: Record<PostTab, TabQuery> = {
  scheduled: { statuses: ["scheduled", "publishing", "pending_approval"], field: "scheduledAt", dir: 1 },
  drafts: { statuses: ["draft"], field: "updatedAt", dir: -1 },
  published: { statuses: ["published", "partially_published"], field: "scheduledAt", dir: -1 },
  failed: { statuses: ["failed", "partially_published"], field: "updatedAt", dir: -1 },
};

export interface PostListItem {
  id: string;
  snippet: string;
  status: GroupStatus;
  /** scheduledAt for scheduled/published, last edit for drafts and failures. */
  at?: string;
  platforms: Platform[];
  channelCount: number;
  thumb?: string;
}

/** Cursor is "<ms>.<id>" of the last row shown, so pages stay stable when times tie. */
function baseFilter(ctx: Ctx, tab: PostTab, channelId?: string): Record<string, unknown> {
  const { statuses, field } = TABS[tab];
  const filter: Record<string, unknown> = { workspaceId: ctx.workspaceId, status: { $in: statuses } };
  if (field === "scheduledAt") filter.scheduledAt = { $ne: null };
  if (channelId && Types.ObjectId.isValid(channelId)) filter.channelIds = new Types.ObjectId(channelId);
  return filter;
}

/** Number of post groups behind each tab, for the count pills. */
export async function countPostTabs(ctx: Ctx, opts: { channelId?: string } = {}): Promise<Record<PostTab, number>> {
  await db();
  const counts = await Promise.all(POST_TABS.map((tab) => PostGroup.countDocuments(baseFilter(ctx, tab, opts.channelId))));
  return Object.fromEntries(POST_TABS.map((tab, i) => [tab, counts[i]])) as Record<PostTab, number>;
}

function parseCursor(cursor?: string): { ms: number; id: Types.ObjectId } | null {
  const [ms, id] = (cursor ?? "").split(".");
  if (!ms || !id || !Types.ObjectId.isValid(id) || !Number.isFinite(Number(ms))) return null;
  return { ms: Number(ms), id: new Types.ObjectId(id) };
}

export async function listPostGroups(
  ctx: Ctx,
  opts: { tab: PostTab; before?: string; limit?: number; channelId?: string },
): Promise<{ items: PostListItem[]; nextCursor?: string }> {
  await db();
  const { field, dir } = TABS[opts.tab];
  const limit = Math.min(opts.limit ?? 25, 100);
  const filter = baseFilter(ctx, opts.tab, opts.channelId);

  const cursor = parseCursor(opts.before);
  if (cursor) {
    const op = dir === 1 ? "$gt" : "$lt";
    const at = new Date(cursor.ms);
    filter.$or = [{ [field]: { [op]: at } }, { [field]: at, _id: { [op]: cursor.id } }];
  }

  const docs = (await PostGroup.find(filter)
    .sort({ [field]: dir, _id: dir })
    .limit(limit + 1)
    .lean()) as (PostGroupDoc & { updatedAt: Date })[];
  const page = docs.slice(0, limit);

  const channelIds = [...new Set(page.flatMap((g) => g.channelIds.map(String)))];
  const mediaIds = [...new Set(page.map((g) => g.mediaIds[0]?.toString()).filter(Boolean))] as string[];
  const [channels, media] = await Promise.all([
    Channel.find({ _id: { $in: channelIds }, workspaceId: ctx.workspaceId }).select("platform").lean(),
    Media.find({ _id: { $in: mediaIds }, workspaceId: ctx.workspaceId }).select("url kind").lean(),
  ]);
  const platformOf = new Map(channels.map((c) => [c._id.toString(), c.platform as Platform]));
  const mediaOf = new Map(media.map((m) => [m._id.toString(), m]));

  const items = page.map((g) => {
    const thumb = g.mediaIds[0] ? mediaOf.get(g.mediaIds[0].toString()) : undefined;
    const at = field === "scheduledAt" ? g.scheduledAt : g.updatedAt;
    return {
      id: g._id.toString(),
      snippet: (g.content ?? "").slice(0, 200),
      status: g.status as GroupStatus,
      at: at?.toISOString(),
      platforms: [...new Set(g.channelIds.map((c) => platformOf.get(c.toString())).filter(Boolean))] as Platform[],
      channelCount: g.channelIds.length,
      thumb: thumb?.kind === "image" ? thumb.url : undefined,
    };
  });

  const last = page[page.length - 1];
  const lastAt = last ? (field === "scheduledAt" ? last.scheduledAt : last.updatedAt) : undefined;
  return {
    items,
    nextCursor: docs.length > limit && last && lastAt ? `${lastAt.getTime()}.${last._id.toString()}` : undefined,
  };
}
