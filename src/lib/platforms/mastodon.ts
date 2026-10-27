import "server-only";
import { randomUUID } from "node:crypto";
import { downloadMedia, fetchJson, platformFetch, sleep } from "./http";
import { PLATFORM_RULES } from "./rules";
import { PlatformError, type AdapterChannel, type AdapterMedia, type PlatformAdapter, type PublishResult } from "./types";

export interface MastodonCredentials {
  accessToken: string;
}
export interface MastodonMeta {
  /** https origin of the server, e.g. https://mastodon.social */
  instance: string;
  accountId: string;
  username: string;
  maxChars: number;
}

type MastoChannel = AdapterChannel<MastodonCredentials, MastodonMeta>;

export function describeMastodonError(status: number, body: unknown) {
  const detail = (body as { error?: string } | undefined)?.error ?? "";
  if (status === 401 || status === 403) return { code: "TOKEN_INVALID", message: "Your Mastodon server rejected our access. Reconnect the account.", authFailed: true };
  if (status === 429) return { code: "RATE_LIMITED", message: "Your Mastodon server is rate limiting us; we'll retry.", temporary: true };
  if (status === 422) return { code: "PLATFORM_REJECTED", message: `Mastodon rejected the post${detail ? `: ${detail}` : "."}`, temporary: false };
  if (status >= 500) return { code: "PLATFORM_UNAVAILABLE", message: "Your Mastodon server had a temporary problem; we'll retry.", temporary: true };
  return undefined;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function uploadMedia(instance: string, token: string, m: AdapterMedia): Promise<string> {
  const form = new FormData();
  form.set("file", await downloadMedia(m.url, PLATFORM_RULES.mastodon.maxBytes[m.kind]), m.filename);
  const res = await platformFetch(`${instance}/api/v2/media`, { method: "POST", headers: auth(token), body: form, timeoutMs: 300_000 }, describeMastodonError);
  const media = (await res.json()) as { id: string; url: string | null };
  if (res.status !== 202 && media.url) return media.id;

  const deadline = Date.now() + 3 * 60_000;
  let delay = 2000;
  for (;;) {
    if (Date.now() + delay > deadline) throw new PlatformError("MEDIA_PROCESSING", "Your Mastodon server is still processing the media; we'll retry.", true);
    await sleep(delay);
    const poll = await platformFetch(`${instance}/api/v1/media/${media.id}`, { headers: auth(token) }, describeMastodonError);
    if (poll.status === 200 && ((await poll.json()) as { url: string | null }).url) return media.id;
    delay = Math.min(delay * 1.5, 10_000);
  }
}

async function postStatus(instance: string, token: string, body: Record<string, unknown>) {
  return fetchJson<{ id: string; url: string; uri: string }>(
    `${instance}/api/v1/statuses`,
    {
      method: "POST",
      headers: { ...auth(token), "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
      body: JSON.stringify(body),
    },
    describeMastodonError,
  );
}

export const mastodonAdapter: PlatformAdapter<MastodonCredentials, MastodonMeta> = {
  platform: "mastodon",

  async publish(channel: MastoChannel, input) {
    const { instance } = channel.meta;
    const token = channel.credentials.accessToken;
    const mediaIds: string[] = [];
    for (const m of input.media) mediaIds.push(await uploadMedia(instance, token, m));

    const status = await postStatus(instance, token, { status: input.text, media_ids: mediaIds, visibility: "public" });
    const result: PublishResult = { platformPostId: status.id, permalink: status.url ?? status.uri };
    if (input.firstComment?.trim()) {
      try {
        await postStatus(instance, token, { status: input.firstComment, in_reply_to_id: status.id, visibility: "unlisted" });
        result.firstComment = "posted";
      } catch {
        result.firstComment = "failed";
      }
    }
    return result;
  },

  async check(channel) {
    await fetchJson(`${channel.meta.instance}/api/v1/accounts/verify_credentials`, { headers: auth(channel.credentials.accessToken) }, describeMastodonError);
  },
};
