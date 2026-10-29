import "server-only";
import { db } from "../db/mongo";
import { AuditLog, Channel, PendingConnection, Post, PostGroup, Workspace, OAuthState, Types, type ChannelDoc } from "../db/models";
import { decryptJson, encryptJson, randomToken } from "../crypto";
import { AppError, notFound } from "../errors";
import { planLimits } from "../plans";
import { assertCan, type Ctx } from "../session";
import type { Platform } from "../platforms/catalog";
import { PlatformError, type AdapterChannel, type ConnectCandidate } from "../platforms/types";
import { listYouTubePlaylists, type YouTubeCredentials, type YouTubePlaylist } from "../platforms/youtube";

export interface ChannelView {
  id: string;
  platform: Platform;
  externalId: string;
  displayName: string;
  username?: string;
  avatar?: string;
  status: "active" | "expired" | "revoked";
  tokenExpiresAt?: string;
  lastError?: string;
  slots: { day: number; time: string }[];
  meta: Record<string, unknown>;
}

/** Strips credentials. The only shape that leaves the server. */
export function toChannelView(c: ChannelDoc): ChannelView {
  return {
    id: c._id.toString(),
    platform: c.platform as Platform,
    externalId: c.externalId,
    displayName: c.displayName,
    username: c.username ?? undefined,
    avatar: c.avatar ?? undefined,
    status: c.status as ChannelView["status"],
    tokenExpiresAt: c.tokenExpiresAt?.toISOString(),
    lastError: c.lastError ?? undefined,
    slots: (c.slots ?? []).map((s) => ({ day: s.day, time: s.time })),
    meta: (c.meta ?? {}) as Record<string, unknown>,
  };
}

export async function listChannels(ctx: Ctx): Promise<ChannelView[]> {
  await db();
  const docs = await Channel.find({ workspaceId: ctx.workspaceId }).sort({ platform: 1, displayName: 1 }).lean();
  return docs.map((d) => toChannelView(d as ChannelDoc));
}

export async function getChannelDoc(ctx: Ctx, id: string | Types.ObjectId) {
  await db();
  const doc = await Channel.findOne({ _id: id, workspaceId: ctx.workspaceId });
  if (!doc) throw notFound("Channel");
  return doc;
}

/** For the publishing engine, which runs outside any user session. */
export function toAdapterChannel<C = Record<string, unknown>, M = Record<string, unknown>>(doc: ChannelDoc): AdapterChannel<C, M> {
  return {
    id: doc._id.toString(),
    platform: doc.platform as Platform,
    externalId: doc.externalId,
    displayName: doc.displayName,
    credentials: decryptJson<C>(doc.credentialsEnc),
    meta: (doc.meta ?? {}) as M,
  };
}

/** Adds or reconnects accounts. Reconnecting an existing account keeps its id, slots and posts. */
export async function upsertChannels(ctx: Ctx, candidates: ConnectCandidate[]): Promise<ChannelView[]> {
  assertCan(ctx, "channel:manage");
  await db();
  const workspace = await Workspace.findById(ctx.workspaceId).select("planId").lean();
  const limits = planLimits(workspace?.planId);

  const existing = await Channel.find({ workspaceId: ctx.workspaceId }).select("platform externalId").lean();
  const key = (p: string, e: string) => `${p}:${e}`;
  const have = new Set(existing.map((c) => key(c.platform, c.externalId)));
  const adding = candidates.filter((c) => !have.has(key(c.platform, c.externalId))).length;
  if (existing.length + adding > limits.maxChannels) {
    throw new AppError("CHANNEL_LIMIT", `Your ${limits.name} plan allows ${limits.maxChannels} connected accounts.`, 402);
  }

  const saved: ChannelView[] = [];
  for (const c of candidates) {
    const doc = await Channel.findOneAndUpdate(
      { workspaceId: ctx.workspaceId, platform: c.platform, externalId: c.externalId },
      {
        $set: {
          displayName: c.displayName,
          username: c.username,
          avatar: c.avatar,
          credentialsEnc: encryptJson(c.credentials),
          tokenExpiresAt: c.tokenExpiresAt ? new Date(c.tokenExpiresAt) : undefined,
          status: "active",
          meta: c.meta,
          connectedBy: ctx.userId,
          lastError: undefined,
          expiryAlertSentAt: undefined,
        },
        $setOnInsert: { slots: [] },
      },
      { upsert: true, returnDocument: "after" },
    );
    saved.push(toChannelView(doc));
  }
  await AuditLog.create({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "channel.connect",
    target: saved.map((s) => s.id).join(","),
  });
  return saved;
}

export async function removeChannel(ctx: Ctx, id: string) {
  assertCan(ctx, "channel:manage");
  const doc = await getChannelDoc(ctx, id);
  // Cancel undelivered posts for this channel, then drop it from their groups.
  await Post.updateMany(
    { channelId: doc._id, status: { $in: ["draft", "scheduled", "retrying"] } },
    { status: "cancelled", lastError: { code: "CHANNEL_REMOVED", message: "The account was disconnected." } },
  );
  await PostGroup.updateMany(
    { workspaceId: ctx.workspaceId, status: { $in: ["draft", "pending_approval"] } },
    { $pull: { channelIds: doc._id } },
  );
  await doc.deleteOne();
  await AuditLog.create({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "channel.remove", target: id });
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function updateSlots(ctx: Ctx, id: string, slots: { day: number; time: string }[]) {
  assertCan(ctx, "channel:manage");
  const clean = slots
    .filter((s) => Number.isInteger(s.day) && s.day >= 0 && s.day <= 6 && TIME_RE.test(s.time))
    .map((s) => ({ day: s.day, time: s.time }));
  const unique = [...new Map(clean.map((s) => [`${s.day}-${s.time}`, s])).values()].sort(
    (a, b) => a.day - b.day || a.time.localeCompare(b.time),
  );
  const doc = await getChannelDoc(ctx, id);
  doc.set("slots", unique);
  await doc.save();
  return toChannelView(doc);
}

/** Called by the engine and the token cron when a platform says the token is dead. */
export async function markChannel(channelId: Types.ObjectId | string, status: ChannelView["status"], lastError?: string) {
  await db();
  await Channel.updateOne({ _id: channelId }, { status, lastError });
}

export async function saveRefreshedCredentials(channelId: Types.ObjectId | string, credentials: unknown, tokenExpiresAt?: Date) {
  await db();
  await Channel.updateOne(
    { _id: channelId },
    { credentialsEnc: encryptJson(credentials), tokenExpiresAt, status: "active", lastError: undefined, expiryAlertSentAt: undefined },
  );
}

// ---------- OAuth handshake state ----------

export async function createOAuthState(
  ctx: Ctx,
  platform: string,
  extra: { codeVerifier?: string; meta?: Record<string, unknown> } = {},
): Promise<string> {
  assertCan(ctx, "channel:manage");
  await db();
  const state = randomToken(24);
  await OAuthState.create({
    state,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    platform,
    codeVerifier: extra.codeVerifier,
    meta: extra.meta ?? {},
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  return state;
}

/** One-time use. Also checks the state belongs to the logged-in user and workspace. */
export async function consumeOAuthState(ctx: Ctx, state: string, platform: string) {
  await db();
  const doc = await OAuthState.findOneAndDelete({
    state,
    platform,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    expiresAt: { $gt: new Date() },
  });
  if (!doc) throw new AppError("OAUTH_STATE_INVALID", "This login attempt expired. Please try connecting again.");
  return doc;
}

// ---------- pick-which-accounts step after OAuth ----------

export async function createPendingConnection(ctx: Ctx, platformGroup: string, candidates: ConnectCandidate[]) {
  await db();
  const doc = await PendingConnection.create({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    platformGroup,
    candidatesEnc: encryptJson(candidates),
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  return doc._id.toString();
}

export async function getPendingConnection(ctx: Ctx, id: string) {
  await db();
  if (!Types.ObjectId.isValid(id)) throw notFound("Connection");
  const doc = await PendingConnection.findOne({ _id: id, workspaceId: ctx.workspaceId, userId: ctx.userId });
  if (!doc) throw new AppError("CONNECTION_EXPIRED", "This connection expired. Please connect again.", 404);
  const candidates = decryptJson<ConnectCandidate[]>(doc.candidatesEnc);
  const existing = await Channel.find({ workspaceId: ctx.workspaceId }).select("platform externalId").lean();
  const have = new Set(existing.map((c) => `${c.platform}:${c.externalId}`));
  return {
    platformGroup: doc.platformGroup,
    candidates: candidates.map((c) => ({
      key: `${c.platform}:${c.externalId}`,
      platform: c.platform,
      displayName: c.displayName,
      username: c.username,
      avatar: c.avatar,
      unavailableReason: c.unavailableReason,
      alreadyConnected: have.has(`${c.platform}:${c.externalId}`),
    })),
  };
}

export async function confirmPendingConnection(ctx: Ctx, id: string, keys: string[]) {
  await db();
  const doc = await PendingConnection.findOne({ _id: id, workspaceId: ctx.workspaceId, userId: ctx.userId });
  if (!doc) throw new AppError("CONNECTION_EXPIRED", "This connection expired. Please connect again.", 404);
  const chosen = decryptJson<ConnectCandidate[]>(doc.candidatesEnc).filter(
    (c) => !c.unavailableReason && keys.includes(`${c.platform}:${c.externalId}`),
  );
  if (chosen.length === 0) throw new AppError("NOTHING_SELECTED", "Pick at least one account to add.");
  const saved = await upsertChannels(ctx, chosen);
  await doc.deleteOne();
  return saved;
}

/** A connected YouTube channel's playlists, for the composer. */
export async function youtubePlaylists(ctx: Ctx, channelId: string): Promise<YouTubePlaylist[]> {
  await db();
  if (!Types.ObjectId.isValid(channelId)) throw notFound("Channel");
  const doc = (await Channel.findOne({ _id: channelId, workspaceId: ctx.workspaceId, platform: "youtube" }).lean()) as ChannelDoc | null;
  if (!doc) throw notFound("Channel");
  try {
    return await listYouTubePlaylists(toAdapterChannel<YouTubeCredentials>(doc).credentials);
  } catch (err) {
    // Show YouTube's own reason (e.g. "reconnect the channel") instead of a generic error.
    if (err instanceof PlatformError) throw new AppError(err.code, err.message, 502);
    throw err;
  }
}
