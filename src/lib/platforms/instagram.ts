import "server-only";
import { fetchJson, sleep } from "./http";
import { describeMetaError, graph, type GraphApi } from "./meta-graph";
import { PlatformError, type AdapterChannel, type AdapterMedia, type PlatformAdapter, type PublishResult, type RefreshResult } from "./types";

/**
 * Instagram Login (`accessToken`, graph.instagram.com, 60-day token) is how accounts connect now.
 * `pageAccessToken` is the older Facebook Login route via a linked Page, kept so those channels still work.
 */
export type InstagramCredentials = { accessToken: string } | { pageAccessToken: string };
export interface InstagramMeta {
  loginType?: "instagram" | "facebook";
  igUserId: string;
  pageId?: string;
  /** App-scoped user id, matched by Meta's deauthorize and data-deletion callbacks. */
  userId: string;
  username?: string;
}

type IgChannel = AdapterChannel<InstagramCredentials, InstagramMeta>;

interface IgApi {
  ig: string;
  token: string;
  api: GraphApi;
}

function apiFor(channel: IgChannel): IgApi {
  const c = channel.credentials;
  const ig = channel.meta.igUserId || channel.externalId;
  return "accessToken" in c ? { ig, token: c.accessToken, api: "instagram" } : { ig, token: c.pageAccessToken, api: "facebook" };
}

const PROCESSING_BUDGET_MS = 4 * 60_000;

async function createContainer(a: IgApi, params: Record<string, string | boolean | undefined>) {
  return (await graph<{ id: string }>("POST", `${a.ig}/media`, a.token, params, a.api)).id;
}

/** Waits until every container is FINISHED, sharing one time budget. */
async function waitForContainers(ids: string[], a: IgApi) {
  const deadline = Date.now() + PROCESSING_BUDGET_MS;
  const pending = new Set(ids);
  let delay = 2000;
  while (pending.size) {
    for (const id of [...pending]) {
      const { status_code, status } = await graph<{ status_code?: string; status?: string }>("GET", id, a.token, { fields: "status_code,status" }, a.api);
      if (status_code === "FINISHED" || status_code === "PUBLISHED") pending.delete(id);
      else if (status_code === "ERROR") throw new PlatformError("MEDIA_REJECTED", `Instagram couldn't process the media${status ? `: ${status}` : "."}`, false, { status });
      else if (status_code === "EXPIRED") throw new PlatformError("MEDIA_EXPIRED", "Instagram's upload expired before it could be published.", true);
    }
    if (!pending.size) break;
    if (Date.now() + delay > deadline) throw new PlatformError("MEDIA_PROCESSING", "Instagram is still processing the video; we'll retry.", true);
    await sleep(delay);
    delay = Math.min(delay * 1.5, 15_000);
  }
}

function itemParams(m: AdapterMedia, carousel: boolean): Record<string, string | boolean> {
  if (m.kind === "video") return { media_type: carousel ? "VIDEO" : "REELS", video_url: m.url, ...(carousel ? { is_carousel_item: true } : {}) };
  return { image_url: m.url, ...(carousel ? { is_carousel_item: true } : {}) };
}

async function assertQuota(a: IgApi) {
  try {
    const res = await graph<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
      "GET",
      `${a.ig}/content_publishing_limit`,
      a.token,
      { fields: "config,quota_usage" },
      a.api,
    );
    const row = res.data?.[0];
    const total = row?.config?.quota_total;
    if (total !== undefined && (row?.quota_usage ?? 0) >= total) {
      throw new PlatformError("PUBLISH_LIMIT_REACHED", `This Instagram account has hit Instagram's limit of ${total} API posts in 24 hours. Try again later.`);
    }
  } catch (err) {
    // The quota check is advisory; only a confirmed limit stops the post.
    if (err instanceof PlatformError && (err.code === "PUBLISH_LIMIT_REACHED" || err.authFailed)) throw err;
  }
}

export const instagramAdapter: PlatformAdapter<InstagramCredentials, InstagramMeta> = {
  platform: "instagram",

  async publish(channel: IgChannel, input) {
    const a = apiFor(channel);
    if (input.media.length === 0) throw new PlatformError("MEDIA_REQUIRED", "Instagram needs at least one image or video.");
    await assertQuota(a);

    let creationId: string;
    if (input.format === "story") {
      const m = input.media[0];
      creationId = await createContainer(a, {
        media_type: "STORIES",
        ...(m.kind === "video" ? { video_url: m.url } : { image_url: m.url }),
      });
      await waitForContainers([creationId], a);
    } else if (input.media.length === 1) {
      const m = input.media[0];
      creationId = await createContainer(a, {
        ...itemParams(m, false),
        caption: input.text,
        ...(m.kind === "video" ? { share_to_feed: input.format !== "reel" ? true : undefined } : {}),
      });
      await waitForContainers([creationId], a);
    } else {
      const children: string[] = [];
      for (const m of input.media) children.push(await createContainer(a, itemParams(m, true)));
      await waitForContainers(children, a);
      creationId = await createContainer(a, { media_type: "CAROUSEL", children: children.join(","), caption: input.text });
      await waitForContainers([creationId], a);
    }

    const { id } = await graph<{ id: string }>("POST", `${a.ig}/media_publish`, a.token, { creation_id: creationId }, a.api);
    let permalink: string | undefined;
    try {
      permalink = (await graph<{ permalink?: string }>("GET", id, a.token, { fields: "permalink" }, a.api)).permalink;
    } catch {}

    const result: PublishResult = { platformPostId: id, permalink };
    if (input.firstComment?.trim() && input.format !== "story") {
      try {
        await graph("POST", `${id}/comments`, a.token, { message: input.firstComment }, a.api);
        result.firstComment = "posted";
      } catch {
        result.firstComment = "failed";
      }
    }
    return result;
  },

  async check(channel) {
    const a = apiFor(channel);
    await graph("GET", a.api === "instagram" ? "me" : a.ig, a.token, { fields: a.api === "instagram" ? "user_id,username" : "id,username" }, a.api);
  },

  /** Instagram Login tokens last 60 days and can be renewed while still valid (and at least a day old). */
  async refresh(channel): Promise<RefreshResult<InstagramCredentials>> {
    const c = channel.credentials;
    if (!("accessToken" in c)) {
      throw new PlatformError("TOKEN_INVALID", "Reconnect this Instagram account to keep posting.", false, undefined, true);
    }
    const params = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: c.accessToken });
    const res = await fetchJson<{ access_token: string; expires_in?: number }>(
      `https://graph.instagram.com/refresh_access_token?${params}`,
      { timeoutMs: 30_000 },
      describeMetaError,
    );
    return {
      credentials: { accessToken: res.access_token },
      tokenExpiresAt: new Date(Date.now() + (res.expires_in ?? 60 * 86_400) * 1000),
    };
  },
};
