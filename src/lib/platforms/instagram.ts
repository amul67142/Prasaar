import "server-only";
import { sleep } from "./http";
import { graph } from "./meta-graph";
import { PlatformError, type AdapterChannel, type AdapterMedia, type PlatformAdapter, type PublishResult } from "./types";

export interface InstagramCredentials {
  /** Token of the Facebook Page the Instagram account is linked to. */
  pageAccessToken: string;
}
export interface InstagramMeta {
  igUserId: string;
  pageId: string;
  userId: string;
  username?: string;
}

type IgChannel = AdapterChannel<InstagramCredentials, InstagramMeta>;

const PROCESSING_BUDGET_MS = 4 * 60_000;

async function createContainer(ig: string, token: string, params: Record<string, string | boolean | undefined>) {
  return (await graph<{ id: string }>("POST", `${ig}/media`, token, params)).id;
}

/** Waits until every container is FINISHED, sharing one time budget. */
async function waitForContainers(ids: string[], token: string) {
  const deadline = Date.now() + PROCESSING_BUDGET_MS;
  const pending = new Set(ids);
  let delay = 2000;
  while (pending.size) {
    for (const id of [...pending]) {
      const { status_code, status } = await graph<{ status_code?: string; status?: string }>("GET", id, token, { fields: "status_code,status" });
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

async function assertQuota(ig: string, token: string) {
  try {
    const res = await graph<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>("GET", `${ig}/content_publishing_limit`, token, {
      fields: "config,quota_usage",
    });
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
    const token = channel.credentials.pageAccessToken;
    const ig = channel.meta.igUserId || channel.externalId;
    if (input.media.length === 0) throw new PlatformError("MEDIA_REQUIRED", "Instagram needs at least one image or video.");
    await assertQuota(ig, token);

    let creationId: string;
    if (input.format === "story") {
      const m = input.media[0];
      creationId = await createContainer(ig, token, {
        media_type: "STORIES",
        ...(m.kind === "video" ? { video_url: m.url } : { image_url: m.url }),
      });
      await waitForContainers([creationId], token);
    } else if (input.media.length === 1) {
      const m = input.media[0];
      creationId = await createContainer(ig, token, {
        ...itemParams(m, false),
        caption: input.text,
        ...(m.kind === "video" ? { share_to_feed: input.format !== "reel" ? true : undefined } : {}),
      });
      await waitForContainers([creationId], token);
    } else {
      const children: string[] = [];
      for (const m of input.media) children.push(await createContainer(ig, token, itemParams(m, true)));
      await waitForContainers(children, token);
      creationId = await createContainer(ig, token, { media_type: "CAROUSEL", children: children.join(","), caption: input.text });
      await waitForContainers([creationId], token);
    }

    const { id } = await graph<{ id: string }>("POST", `${ig}/media_publish`, token, { creation_id: creationId });
    let permalink: string | undefined;
    try {
      permalink = (await graph<{ permalink?: string }>("GET", id, token, { fields: "permalink" })).permalink;
    } catch {}

    const result: PublishResult = { platformPostId: id, permalink };
    if (input.firstComment?.trim() && input.format !== "story") {
      try {
        await graph("POST", `${id}/comments`, token, { message: input.firstComment });
        result.firstComment = "posted";
      } catch {
        result.firstComment = "failed";
      }
    }
    return result;
  },

  async check(channel) {
    await graph("GET", channel.meta.igUserId || channel.externalId, channel.credentials.pageAccessToken, { fields: "id,username" });
  },
};
