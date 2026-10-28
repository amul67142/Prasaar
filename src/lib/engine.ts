import "server-only";
import { db } from "./db/mongo";
import { Channel, Media, Member, Post, PostGroup, PostLog, Usage, User, Types, type ChannelDoc, type MediaDoc, type PostDoc, type PostGroupDoc } from "./db/models";
import { appUrl } from "./env";
import { sendEmail } from "./email";
import { enqueuePublish, queueEnabled } from "./queue";
import { getAdapter } from "./platforms";
import { PLATFORM_INFO, type Platform } from "./platforms/catalog";
import { PlatformError, type AdapterMedia } from "./platforms/types";
import { markChannel, saveRefreshedCredentials, toAdapterChannel } from "./services/channels";
import { refreshGroupStatus, type PlatformOverride } from "./services/posts";

/** Delay before retry n (1-based) of a temporary failure. */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000];
/** Jobs may arrive a little early; anything due within this window runs. */
const EARLY_MS = 15_000;
/** A post stuck in "publishing" longer than this was interrupted mid-send. */
const STUCK_MS = 10 * 60_000;

async function log(post: PostDoc, level: "info" | "warn" | "error", message: string, platformResponse?: unknown) {
  await PostLog.create({ postId: post._id, workspaceId: post.workspaceId, level, message, platformResponse });
}

/**
 * Publishes one post to one channel. Safe to call more than once for the same post:
 * the status flip below is atomic, so a duplicate job finds nothing to do.
 */
export async function publishPost(postId: string): Promise<"published" | "retrying" | "failed" | "skipped"> {
  await db();
  if (!Types.ObjectId.isValid(postId)) return "skipped";
  const due = new Date(Date.now() + EARLY_MS);
  const post = (await Post.findOneAndUpdate(
    {
      _id: postId,
      $or: [
        { status: "scheduled", scheduledAt: { $lte: due } },
        { status: "retrying", nextAttemptAt: { $lte: due } },
      ],
    },
    { $set: { status: "publishing", lockedAt: new Date() }, $inc: { attempts: 1 } },
    { returnDocument: "after" },
  ).lean()) as PostDoc | null;
  if (!post) return "skipped"; // Already handled, cancelled, or rescheduled later.

  await PostGroup.updateOne({ _id: post.postGroupId, status: "scheduled" }, { status: "publishing" });

  try {
    const [group, channel] = await Promise.all([
      PostGroup.findById(post.postGroupId).lean() as Promise<PostGroupDoc | null>,
      Channel.findById(post.channelId) as unknown as Promise<(ChannelDoc & { save(): Promise<unknown> }) | null>,
    ]);
    if (!group) throw new PlatformError("POST_DELETED", "The post was deleted.");
    if (!channel) throw new PlatformError("CHANNEL_REMOVED", "The account was disconnected.");
    if (channel.status !== "active") {
      throw new PlatformError("CHANNEL_NOT_ACTIVE", `${channel.displayName} needs to be reconnected.`, false, undefined, true);
    }

    const adapter = getAdapter(channel.platform as Platform);
    let adapterChannel = toAdapterChannel(channel);

    // Refresh tokens that expire within a day, before using them.
    if (adapter.refresh && channel.tokenExpiresAt && channel.tokenExpiresAt.getTime() < Date.now() + 86_400_000) {
      const refreshed = await adapter.refresh(adapterChannel);
      await saveRefreshedCredentials(channel._id, refreshed.credentials, refreshed.tokenExpiresAt);
      adapterChannel = { ...adapterChannel, credentials: refreshed.credentials };
      await log(post, "info", "Refreshed the account's access token.");
    }

    const mediaDocs = (await Media.find({ _id: { $in: group.mediaIds } }).lean()) as MediaDoc[];
    const byId = new Map(mediaDocs.map((m) => [m._id.toString(), m]));
    const media: AdapterMedia[] = group.mediaIds.map((id) => {
      const m = byId.get(id.toString());
      if (!m || m.status !== "ready") throw new PlatformError("MEDIA_MISSING", "An attached file is missing or still uploading.");
      return {
        url: m.url,
        mime: m.mime,
        kind: m.kind as AdapterMedia["kind"],
        sizeBytes: m.sizeBytes,
        filename: m.filename,
        width: m.width ?? undefined,
        height: m.height ?? undefined,
        durationSec: m.durationSec ?? undefined,
      };
    });

    const platform = channel.platform as Platform;
    const o = ((group.perPlatform ?? {}) as Record<string, PlatformOverride>)[platform] ?? {};
    await log(post, "info", `Publishing to ${channel.displayName} (attempt ${post.attempts}).`);
    const result = await adapter.publish(adapterChannel, {
      text: o.content ?? group.content ?? "",
      media,
      format: o.format ?? "feed",
      firstComment: (o.firstComment ?? group.firstComment) || undefined,
      title: o.title,
      privacy: o.privacy,
      madeForKids: o.madeForKids,
    });

    await Post.updateOne(
      { _id: post._id },
      {
        status: "published",
        platformPostId: result.platformPostId,
        permalink: result.permalink,
        publishedAt: new Date(),
        firstCommentStatus: result.firstComment ?? "none",
        $unset: { lastError: 1, nextAttemptAt: 1 },
      },
    );
    await log(post, "info", `Published${result.permalink ? `: ${result.permalink}` : "."}`, result.raw);
    if (result.firstComment === "failed") await log(post, "warn", "The post went out, but the first comment couldn't be added.");
    const month = new Date().toISOString().slice(0, 7);
    await Usage.updateOne({ workspaceId: post.workspaceId, month }, { $inc: { postsPublished: 1 } }, { upsert: true });
    await refreshGroupStatus(post.postGroupId);
    return "published";
  } catch (err) {
    return handleFailure(post, err);
  }
}

async function handleFailure(post: PostDoc, err: unknown): Promise<"retrying" | "failed"> {
  const e =
    err instanceof PlatformError
      ? err
      : new PlatformError("INTERNAL", "Something went wrong on our side while publishing.", true, err instanceof Error ? err.message : String(err));
  if (!(err instanceof PlatformError)) console.error("[engine] unexpected error", err);

  if (e.authFailed) await markChannel(post.channelId, "expired", e.message);

  const attempt = post.attempts ?? 1;
  if (e.temporary && attempt <= BACKOFF_MS.length) {
    const nextAttemptAt = new Date(Date.now() + BACKOFF_MS[attempt - 1]);
    await Post.updateOne({ _id: post._id }, { status: "retrying", nextAttemptAt, lastError: { code: e.code, message: e.message } });
    await log(post, "warn", `${e.message} Retrying at ${nextAttemptAt.toISOString()}.`, e.raw);
    await enqueuePublish(post._id.toString(), nextAttemptAt);
    await refreshGroupStatus(post.postGroupId);
    return "retrying";
  }

  await Post.updateOne({ _id: post._id }, { status: "failed", lastError: { code: e.code, message: e.message }, $unset: { nextAttemptAt: 1 } });
  await log(post, "error", e.message, e.raw);
  await refreshGroupStatus(post.postGroupId);
  await alertFailure(post, e.message).catch((alertErr) => console.error("[engine] failure alert", alertErr));
  return "failed";
}

async function alertFailure(post: PostDoc, reason: string) {
  const [group, channel] = await Promise.all([
    PostGroup.findById(post.postGroupId).select("createdBy").lean(),
    Channel.findById(post.channelId).select("displayName platform").lean(),
  ]);
  const admins = await Member.find({ workspaceId: post.workspaceId, role: { $in: ["owner", "admin"] } }).select("userId").lean();
  const ids = [...new Set([group?.createdBy?.toString(), ...admins.map((a) => a.userId.toString())].filter((x): x is string => Boolean(x)))];
  const users = await User.find({ _id: { $in: ids }, "notify.postFailed": { $ne: false } }).select("email name").lean();
  const where = channel ? `${channel.displayName} (${PLATFORM_INFO[channel.platform as Platform].label})` : "one of your accounts";
  await Promise.all(
    users.map((u) =>
      sendEmail({
        to: u.email,
        subject: `A post to ${channel?.displayName ?? "your account"} failed`,
        lines: [`Hi ${u.name},`, `A scheduled post couldn't be published to ${where}.`, `Reason: ${reason}`],
        action: { label: "Open the post", url: `${appUrl()}/posts/${post.postGroupId.toString()}` },
      }),
    ),
  );
}

/**
 * Safety net, run every minute by cron. Picks up posts that are due but whose queue job
 * never arrived (outage, no QStash in dev), and fails posts interrupted mid-send.
 */
export async function sweep(): Promise<{ ran: number; enqueued: number; interrupted: number }> {
  await db();
  const now = Date.now();
  // With a queue, give its jobs a head start so the sweep doesn't race them.
  const grace = queueEnabled() ? 90_000 : 0;
  const cutoff = new Date(now - grace + EARLY_MS);

  const stuck = await Post.find({ status: "publishing", lockedAt: { $lt: new Date(now - STUCK_MS) } }).lean();
  for (const p of stuck as PostDoc[]) {
    // We can't tell whether the platform received it, so don't resend: a duplicate is worse.
    const res = await Post.updateOne(
      { _id: p._id, status: "publishing" },
      { status: "failed", lastError: { code: "PUBLISH_INTERRUPTED", message: "Publishing was interrupted. Check the account before retrying, in case it went out." } },
    );
    if (res.modifiedCount) {
      await log(p, "error", "Publishing was interrupted before we got an answer from the platform.");
      await refreshGroupStatus(p.postGroupId);
    }
  }

  const due = await Post.find({
    $or: [
      { status: "scheduled", scheduledAt: { $lte: cutoff } },
      { status: "retrying", nextAttemptAt: { $lte: cutoff } },
    ],
  })
    .sort({ scheduledAt: 1 })
    .limit(200)
    .select("_id")
    .lean();

  if (queueEnabled()) {
    await Promise.all(due.map((p) => enqueuePublish(p._id.toString(), new Date())));
    return { ran: 0, enqueued: due.length, interrupted: stuck.length };
  }

  let ran = 0;
  const ids = due.map((p) => p._id.toString());
  const workers = Array.from({ length: Math.min(5, ids.length) }, async () => {
    for (let id = ids.shift(); id; id = ids.shift()) {
      await publishPost(id);
      ran++;
    }
  });
  await Promise.all(workers);
  return { ran, enqueued: 0, interrupted: stuck.length };
}
