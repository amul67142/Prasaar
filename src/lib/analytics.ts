import "server-only";
import { db } from "./db/mongo";
import { Channel, ChannelStat, Post, PostGroup, Types, type ChannelDoc } from "./db/models";
import { getAdapter } from "./platforms";
import type { Platform } from "./platforms/catalog";
import type { PostFormat } from "./platforms/rules";
import { PlatformError, type MetricsTarget } from "./platforms/types";
import { toAdapterChannel } from "./services/channels";

const DAY = 86_400_000;
/** Posts keep collecting numbers for this long after publishing, then stay as they are. */
export const METRICS_WINDOW_DAYS = 30;
const MAX_POSTS_PER_CHANNEL = 100;

export interface CollectOptions {
  workspaceId?: Types.ObjectId | string;
  /** Skip posts whose numbers are fresher than this. */
  minAgeMs: number;
  /** Stop starting new channels after this long, so a run fits its function time limit. */
  budgetMs: number;
}

export interface CollectResult {
  channels: number;
  posts: number;
  followers: number;
  errors: number;
  /** Channels left for the next run because the time budget ran out. */
  skipped: number;
}

/**
 * Pulls follower counts and post engagement from each platform. Runs daily from cron and on
 * demand from the Analytics page. Channels are done oldest-data-first, so an interrupted run
 * picks up where it stopped next time.
 */
export async function collectAnalytics(opts: CollectOptions): Promise<CollectResult> {
  await db();
  const started = Date.now();
  const filter: Record<string, unknown> = { status: "active" };
  if (opts.workspaceId) filter.workspaceId = new Types.ObjectId(String(opts.workspaceId));
  const channels = (await Channel.find(filter).sort({ updatedAt: 1 }).lean()) as ChannelDoc[];
  const result: CollectResult = { channels: 0, posts: 0, followers: 0, errors: 0, skipped: 0 };

  // A few channels at a time: different platforms, so no one API sees a burst.
  const queue = [...channels];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      if (Date.now() - started > opts.budgetMs) {
        result.skipped++;
        continue;
      }
      const r = await collectChannel(c, opts.minAgeMs);
      result.channels++;
      result.posts += r.posts;
      result.followers += r.followers ? 1 : 0;
      result.errors += r.error ? 1 : 0;
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return result;
}

async function collectChannel(channel: ChannelDoc, minAgeMs: number): Promise<{ posts: number; followers: boolean; error: boolean }> {
  const adapter = getAdapter(channel.platform as Platform);
  if (!adapter.metrics && !adapter.followers) return { posts: 0, followers: false, error: false };
  const adapterChannel = toAdapterChannel(channel);
  const notes: string[] = [];
  let error = false;
  let followers = false;
  let posts = 0;

  if (adapter.followers) {
    try {
      const n = await adapter.followers(adapterChannel);
      const now = new Date();
      await ChannelStat.updateOne(
        { channelId: channel._id, day: now.toISOString().slice(0, 10) },
        { $set: { workspaceId: channel.workspaceId, followers: n, at: now } },
        { upsert: true },
      );
      await Channel.updateOne({ _id: channel._id }, { followers: n });
      followers = true;
    } catch (err) {
      error = true;
      notes.push(describe(err, "follower count"));
    }
  }

  if (adapter.metrics) {
    const due = await Post.find({
      channelId: channel._id,
      status: "published",
      platformPostId: { $exists: true, $ne: "" },
      publishedAt: { $gte: new Date(Date.now() - METRICS_WINDOW_DAYS * DAY) },
      $or: [{ metricsAt: { $exists: false } }, { metricsAt: { $lt: new Date(Date.now() - minAgeMs) } }],
    })
      .sort({ metricsAt: 1 })
      .limit(MAX_POSTS_PER_CHANNEL)
      .select("_id platformPostId postGroupId")
      .lean();
    if (due.length) {
      const groups = await PostGroup.find({ _id: { $in: due.map((p) => p.postGroupId) } }).select("perPlatform").lean();
      const formatOf = new Map(
        groups.map((g) => [g._id.toString(), ((g.perPlatform ?? {}) as Record<string, { format?: PostFormat }>)[channel.platform]?.format ?? "feed"]),
      );
      const targets: MetricsTarget[] = due.map((p) => ({
        id: p._id.toString(),
        platformPostId: p.platformPostId!,
        format: formatOf.get(p.postGroupId.toString()) ?? "feed",
      }));
      try {
        const res = await adapter.metrics(adapterChannel, targets);
        const now = new Date();
        await Post.bulkWrite(
          targets.map((t) => ({
            updateOne: {
              filter: { _id: new Types.ObjectId(t.id) },
              // Posts the platform no longer returns (deleted there) still get a timestamp, so they're not retried every run.
              update: res.posts[t.id] ? { $set: { metrics: clean(res.posts[t.id]), metricsAt: now } } : { $set: { metricsAt: now } },
            },
          })),
        );
        posts = Object.keys(res.posts).length;
        if (res.note) notes.push(res.note);
      } catch (err) {
        error = true;
        notes.push(describe(err, "post stats"));
      }
    }
  }

  await Channel.updateOne({ _id: channel._id }, notes.length ? { analyticsNote: notes.join(" ") } : { $unset: { analyticsNote: 1 } });
  return { posts, followers, error };
}

function clean<T extends object>(m: T): Partial<T> {
  return Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === "number" && Number.isFinite(v))) as Partial<T>;
}

function describe(err: unknown, what: string): string {
  if (err instanceof PlatformError) {
    if (err.authFailed) return `Couldn't read the ${what}: the connection needs to be renewed. Reconnect this account.`;
    if (err.code === "NO_FOLLOWERS") return err.message;
    return `Couldn't read the ${what} this time: ${err.message}`;
  }
  console.error(`[analytics] ${what}`, err);
  return `Couldn't read the ${what} this time.`;
}
