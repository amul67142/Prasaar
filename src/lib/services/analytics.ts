import "server-only";
import { collectAnalytics, METRICS_WINDOW_DAYS } from "../analytics";
import { db } from "../db/mongo";
import { Channel, ChannelStat, Post, PostGroup, Workspace, Types, type ChannelDoc } from "../db/models";
import { AppError } from "../errors";
import { engagementOf, METRIC_KEYS, type MetricKey } from "../platforms/analytics-info";
import type { Platform } from "../platforms/catalog";
import { addDaysYmd } from "../time";
import type { Ctx } from "../session";

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

type Totals = Record<MetricKey, number> & { posts: number; engagement: number };

export interface ChannelAnalytics {
  id: string;
  platform: Platform;
  displayName: string;
  avatar?: string;
  status: string;
  followers?: number;
  /** Change over the range, when there's a reading from its start. */
  followersChange?: number;
  posts: number;
  engagement: number;
  note?: string;
}

export interface TopPost {
  postId: string;
  groupId: string;
  channelId: string;
  platform: Platform;
  channelName: string;
  snippet: string;
  publishedAt: string;
  permalink?: string;
  metrics: Partial<Record<MetricKey, number>>;
  engagement: number;
}

export interface AnalyticsView {
  range: AnalyticsRange;
  totals: Totals;
  previous: Totals;
  /** Total followers across channels, one point per day with any reading. */
  followers: { day: string; value: number }[];
  followersNow?: number;
  followersChange?: number;
  /** First day with a reading in the range; later than the range start for new accounts. */
  followersSince?: string;
  channels: ChannelAnalytics[];
  topPosts: TopPost[];
  lastCollectedAt?: string;
  refreshedAt?: string;
}

const emptyTotals = (): Totals => ({ posts: 0, engagement: 0, likes: 0, comments: 0, shares: 0, saves: 0, views: 0, reach: 0 });

export async function getAnalytics(ctx: Ctx, range: AnalyticsRange): Promise<AnalyticsView> {
  await db();
  const ws = new Types.ObjectId(ctx.workspaceId);
  const now = Date.now();
  const from = new Date(now - range * 86_400_000);
  const prevFrom = new Date(now - 2 * range * 86_400_000);

  const [channels, posts, prevPosts, workspace] = await Promise.all([
    Channel.find({ workspaceId: ws }).sort({ createdAt: 1 }).lean() as Promise<ChannelDoc[]>,
    Post.find({ workspaceId: ws, status: "published", publishedAt: { $gte: from } })
      .select("postGroupId channelId platform publishedAt permalink metrics metricsAt")
      .lean(),
    Post.find({ workspaceId: ws, status: "published", publishedAt: { $gte: prevFrom, $lt: from } })
      .select("metrics")
      .lean(),
    Workspace.findById(ws).select("analyticsRefreshedAt").lean(),
  ]);

  const sum = (list: { metrics?: Partial<Record<MetricKey, number | null>> | null }[]) => {
    const t = emptyTotals();
    for (const p of list) {
      t.posts++;
      const m = p.metrics ?? {};
      for (const k of METRIC_KEYS) t[k] += m[k] ?? 0;
      t.engagement += engagementOf(m as Partial<Record<MetricKey, number>>);
    }
    return t;
  };

  // Follower history: total across channels per day, carrying each channel's last reading forward.
  const startDay = from.toISOString().slice(0, 10);
  const today = new Date(now).toISOString().slice(0, 10);
  const stats = await ChannelStat.find({ workspaceId: ws, day: { $gte: addDaysYmd(startDay, -7) } })
    .sort({ day: 1 })
    .select("channelId day followers")
    .lean();
  const byChannel = new Map<string, { day: string; followers: number }[]>();
  for (const s of stats) {
    const k = s.channelId.toString();
    if (!byChannel.has(k)) byChannel.set(k, []);
    byChannel.get(k)!.push({ day: s.day, followers: s.followers });
  }
  const days = [...new Set(stats.map((s) => s.day).filter((d) => d >= startDay))].sort();
  const followers = days.map((day) => {
    let value = 0;
    for (const series of byChannel.values()) {
      const last = [...series].reverse().find((p) => p.day <= day);
      if (last) value += last.followers;
    }
    return { day, value };
  });
  const atOrBefore = (series: { day: string; followers: number }[] | undefined, day: string) =>
    series ? [...series].reverse().find((p) => p.day <= day) ?? series.find((p) => p.day >= day) : undefined;

  const postsByChannel = new Map<string, typeof posts>();
  for (const p of posts) {
    const k = p.channelId.toString();
    if (!postsByChannel.has(k)) postsByChannel.set(k, []);
    postsByChannel.get(k)!.push(p);
  }

  const channelViews: ChannelAnalytics[] = channels.map((c) => {
    const id = c._id.toString();
    const series = byChannel.get(id);
    const start = atOrBefore(series, startDay);
    const mine = postsByChannel.get(id) ?? [];
    return {
      id,
      platform: c.platform as Platform,
      displayName: c.displayName,
      avatar: c.avatar ?? undefined,
      status: c.status,
      followers: c.followers ?? undefined,
      followersChange: c.followers != null && start && start.day < today ? c.followers - start.followers : undefined,
      posts: mine.length,
      engagement: mine.reduce((n, p) => n + engagementOf((p.metrics ?? {}) as Partial<Record<MetricKey, number>>), 0),
      note: c.analyticsNote ?? undefined,
    };
  });

  const groups = await PostGroup.find({ _id: { $in: [...new Set(posts.map((p) => p.postGroupId.toString()))] } })
    .select("content perPlatform")
    .lean();
  const textOf = new Map(
    groups.map((g) => [g._id.toString(), { content: g.content ?? "", per: (g.perPlatform ?? {}) as Record<string, { content?: string }> }]),
  );
  const channelById = new Map(channelViews.map((c) => [c.id, c]));
  const topPosts: TopPost[] = posts
    .filter((p) => p.metricsAt)
    .map((p) => {
      const m = Object.fromEntries(METRIC_KEYS.filter((k) => typeof p.metrics?.[k] === "number").map((k) => [k, p.metrics![k] as number]));
      const g = textOf.get(p.postGroupId.toString());
      const text = g?.per[p.platform]?.content ?? g?.content ?? "";
      return {
        postId: p._id.toString(),
        groupId: p.postGroupId.toString(),
        channelId: p.channelId.toString(),
        platform: p.platform as Platform,
        channelName: channelById.get(p.channelId.toString())?.displayName ?? "Removed channel",
        snippet: text.replace(/\s+/g, " ").trim().slice(0, 140),
        publishedAt: p.publishedAt!.toISOString(),
        permalink: p.permalink ?? undefined,
        metrics: m,
        engagement: engagementOf(m),
      };
    })
    .sort((a, b) => b.engagement - a.engagement || (b.metrics.views ?? 0) - (a.metrics.views ?? 0))
    .slice(0, 10);

  const tracked = channelViews.filter((c) => c.followers != null);
  const lastCollected = posts.reduce<Date | undefined>((d, p) => (p.metricsAt && (!d || p.metricsAt > d) ? p.metricsAt : d), undefined);
  const followersNow = tracked.length ? tracked.reduce((n, c) => n + c.followers!, 0) : undefined;
  const firstPoint = followers[0]?.value;

  return {
    range,
    totals: sum(posts),
    previous: sum(prevPosts),
    followers,
    followersNow,
    followersChange: followersNow != null && firstPoint != null && followers.length > 1 ? followersNow - firstPoint : undefined,
    followersSince: followers.length > 1 ? followers[0].day : undefined,
    channels: channelViews,
    topPosts,
    lastCollectedAt: lastCollected?.toISOString(),
    refreshedAt: workspace?.analyticsRefreshedAt?.toISOString(),
  };
}

const REFRESH_COOLDOWN_MS = 10 * 60_000;

/** "Refresh stats": collect now for this workspace, at most every 10 minutes. */
export async function refreshAnalytics(ctx: Ctx) {
  await db();
  const cutoff = new Date(Date.now() - REFRESH_COOLDOWN_MS);
  // Claim the slot atomically so double clicks or two teammates don't both run it.
  const claimed = await Workspace.findOneAndUpdate(
    { _id: ctx.workspaceId, $or: [{ analyticsRefreshedAt: { $exists: false } }, { analyticsRefreshedAt: { $lt: cutoff } }] },
    { analyticsRefreshedAt: new Date() },
  );
  if (!claimed) {
    throw new AppError("REFRESH_TOO_SOON", "Stats were refreshed in the last 10 minutes. Try again shortly.", 429);
  }
  return collectAnalytics({ workspaceId: ctx.workspaceId, minAgeMs: REFRESH_COOLDOWN_MS, budgetMs: 45_000 });
}

export { METRICS_WINDOW_DAYS };
