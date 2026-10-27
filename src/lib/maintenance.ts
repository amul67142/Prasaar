import "server-only";
import { db } from "./db/mongo";
import { Channel, Media, Member, User, type ChannelDoc } from "./db/models";
import { appUrl } from "./env";
import { sendEmail } from "./email";
import { getAdapter } from "./platforms";
import { PLATFORM_INFO, type Platform } from "./platforms/catalog";
import { PlatformError } from "./platforms/types";
import { markChannel, saveRefreshedCredentials, toAdapterChannel } from "./services/channels";
import { storage } from "./storage";

const DAY = 86_400_000;

/** Daily: refresh tokens expiring within 7 days; warn people when we can't. */
export async function refreshExpiringTokens() {
  await db();
  const soon = new Date(Date.now() + 7 * DAY);
  const channels = (await Channel.find({ status: "active", tokenExpiresAt: { $lt: soon } })) as unknown as (ChannelDoc & { save(): Promise<unknown> })[];
  let refreshed = 0;
  let alerted = 0;

  for (const channel of channels) {
    const adapter = getAdapter(channel.platform as Platform);
    if (adapter.refresh) {
      try {
        const res = await adapter.refresh(toAdapterChannel(channel));
        await saveRefreshedCredentials(channel._id, res.credentials, res.tokenExpiresAt);
        refreshed++;
        continue;
      } catch (err) {
        if (!(err instanceof PlatformError && err.authFailed)) console.error(`[tokens] refresh ${channel._id}`, err);
      }
    }
    if (channel.tokenExpiresAt && channel.tokenExpiresAt.getTime() < Date.now()) {
      await markChannel(channel._id, "expired", "The connection expired. Reconnect this account.");
    }
    if (!channel.expiryAlertSentAt) {
      await alertExpiring(channel);
      await Channel.updateOne({ _id: channel._id }, { expiryAlertSentAt: new Date() });
      alerted++;
    }
  }
  return { checked: channels.length, refreshed, alerted };
}

async function alertExpiring(channel: ChannelDoc) {
  const admins = await Member.find({ workspaceId: channel.workspaceId, role: { $in: ["owner", "admin"] } }).select("userId").lean();
  const users = await User.find({ _id: { $in: admins.map((a) => a.userId) }, "notify.tokenExpiring": { $ne: false } }).select("email name").lean();
  const label = PLATFORM_INFO[channel.platform as Platform].label;
  const when = channel.tokenExpiresAt
    ? channel.tokenExpiresAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" })
    : "soon";
  await Promise.all(
    users.map((u) =>
      sendEmail({
        to: u.email,
        subject: `Reconnect ${channel.displayName} on ${label}`,
        lines: [
          `Hi ${u.name},`,
          `The connection to ${channel.displayName} (${label}) expires on ${when}. After that, scheduled posts to it will fail.`,
          "Reconnecting takes a few seconds and keeps all your scheduled posts.",
        ],
        action: { label: "Reconnect", url: `${appUrl()}/channels` },
      }),
    ),
  );
}

/** Daily: drop abandoned uploads, and non-library media past its keep date. */
export async function cleanupMedia() {
  await db();
  const stale = await Media.find({
    $or: [
      { status: { $in: ["uploading", "failed"] }, createdAt: { $lt: new Date(Date.now() - DAY) } },
      { inLibrary: false, deleteAfter: { $lt: new Date() } },
    ],
  })
    .limit(500)
    .lean();
  let removed = 0;
  for (const m of stale) {
    try {
      await (await storage()).remove(m.storageKey);
      await Media.deleteOne({ _id: m._id });
      removed++;
    } catch (err) {
      console.error(`[media-cleanup] ${m._id}`, err);
    }
  }
  return { removed };
}
