import "server-only";
// The SDK is large; load it only when a Bluesky account is actually used.
const sdk = () => import("@atproto/api");
import { downloadMedia } from "./http";
import { PLATFORM_RULES } from "./rules";
import { fetchJson } from "./http";
import { PlatformError, type AdapterChannel, type MetricsResult, type PlatformAdapter } from "./types";

export interface BlueskyCredentials {
  identifier: string;
  appPassword: string;
}
export interface BlueskyMeta {
  did: string;
  handle: string;
  service: string;
}

type BskyChannel = AdapterChannel<BlueskyCredentials, BlueskyMeta>;

export const BLUESKY_DEFAULT_SERVICE = "https://bsky.social";
/** Bluesky's public read API: counts for any post or profile, whichever server hosts the account. */
const BLUESKY_APPVIEW = "https://public.api.bsky.app";

function describeBlueskyHttpError(status: number) {
  if (status === 429) return { code: "RATE_LIMITED", message: "Bluesky is rate limiting us; we'll retry.", temporary: true };
  if (status >= 500) return { code: "PLATFORM_UNAVAILABLE", message: "Couldn't reach Bluesky; we'll retry.", temporary: true };
  return { code: "PLATFORM_REJECTED", message: `Bluesky couldn't return stats (HTTP ${status}).`, authFailed: false };
}

/** Maps @atproto XRPC errors onto PlatformError. */
export function toBlueskyError(err: unknown): PlatformError {
  if (err instanceof PlatformError) return err;
  const e = err as { status?: number; error?: string; message?: string };
  const detail = e?.message ?? String(err);
  if (e?.error === "AuthenticationRequired" || e?.error === "ExpiredToken" || e?.error === "InvalidToken" || e?.status === 401) {
    return new PlatformError("TOKEN_INVALID", "Bluesky rejected the app password. Create a new one and reconnect.", false, detail, true);
  }
  if (e?.error === "AccountTakedown" || e?.error === "AccountDeactivated") {
    return new PlatformError("ACCOUNT_UNAVAILABLE", "This Bluesky account is suspended or deactivated.", false, detail, true);
  }
  if (e?.status === 429 || e?.error === "RateLimitExceeded") return new PlatformError("RATE_LIMITED", "Bluesky is rate limiting this account; we'll retry.", true, detail);
  if (!e?.status || e.status >= 500) return new PlatformError("PLATFORM_UNAVAILABLE", "Couldn't reach Bluesky; we'll retry.", true, detail);
  return new PlatformError("PLATFORM_REJECTED", `Bluesky rejected the post: ${detail}`, false, detail);
}

export async function blueskyLogin(service: string, identifier: string, password: string) {
  const { AtpAgent } = await sdk();
  const agent = new AtpAgent({ service });
  try {
    await agent.login({ identifier, password });
  } catch (err) {
    throw toBlueskyError(err);
  }
  return agent;
}

export const blueskyAdapter: PlatformAdapter<BlueskyCredentials, BlueskyMeta> = {
  platform: "bluesky",

  async publish(channel: BskyChannel, input) {
    const { identifier, appPassword } = channel.credentials;
    const agent = await blueskyLogin(channel.meta.service || BLUESKY_DEFAULT_SERVICE, identifier, appPassword);
    try {
      const images = [];
      for (const m of input.media.filter((x) => x.kind === "image")) {
        const blob = await downloadMedia(m.url, PLATFORM_RULES.bluesky.maxBytes.image);
        const { data } = await agent.uploadBlob(new Uint8Array(await blob.arrayBuffer()), { encoding: m.mime });
        images.push({
          image: data.blob,
          alt: "",
          ...(m.width && m.height ? { aspectRatio: { width: m.width, height: m.height } } : {}),
        });
      }
      const { RichText } = await sdk();
      const rt = new RichText({ text: input.text });
      await rt.detectFacets(agent);
      const res = await agent.post({
        text: rt.text,
        facets: rt.facets,
        ...(images.length ? { embed: { $type: "app.bsky.embed.images", images } } : {}),
      });
      const rkey = res.uri.split("/").pop();
      const handle = channel.meta.handle || agent.session?.handle || channel.meta.did;
      return { platformPostId: res.uri, permalink: `https://bsky.app/profile/${handle}/post/${rkey}`, raw: res };
    } catch (err) {
      throw toBlueskyError(err);
    }
  },

  async check(channel) {
    await blueskyLogin(channel.meta.service || BLUESKY_DEFAULT_SERVICE, channel.credentials.identifier, channel.credentials.appPassword);
  },

  async metrics(_channel, posts): Promise<MetricsResult> {
    const out: MetricsResult = { posts: {} };
    for (let i = 0; i < posts.length; i += 25) {
      const batch = posts.slice(i, i + 25);
      const q = new URLSearchParams();
      for (const p of batch) q.append("uris", p.platformPostId);
      const res = await fetchJson<{ posts?: { uri: string; likeCount?: number; replyCount?: number; repostCount?: number; quoteCount?: number }[] }>(
        `${BLUESKY_APPVIEW}/xrpc/app.bsky.feed.getPosts?${q}`,
        {},
        describeBlueskyHttpError,
      );
      const byUri = new Map((res.posts ?? []).map((p) => [p.uri, p]));
      for (const p of batch) {
        const s = byUri.get(p.platformPostId);
        if (s) out.posts[p.id] = { likes: s.likeCount ?? 0, comments: s.replyCount ?? 0, shares: (s.repostCount ?? 0) + (s.quoteCount ?? 0) };
      }
    }
    return out;
  },

  async followers(channel) {
    const res = await fetchJson<{ followersCount?: number }>(
      `${BLUESKY_APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(channel.meta.did || channel.externalId)}`,
      {},
      describeBlueskyHttpError,
    );
    if (typeof res.followersCount !== "number") throw new PlatformError("NO_FOLLOWERS", "Bluesky didn't return a follower count.");
    return res.followersCount;
  },
};
