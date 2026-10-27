import "server-only";
import { config } from "../env";
import { graph, metaRawPost } from "./meta-graph";
import { PlatformError, type AdapterChannel, type PlatformAdapter, type PublishResult } from "./types";

export interface FacebookCredentials {
  pageAccessToken: string;
}
export interface FacebookMeta {
  pageId: string;
  /** App-scoped Facebook user id of whoever connected the Page; used for data-deletion callbacks. */
  userId: string;
}

type FbChannel = AdapterChannel<FacebookCredentials, FacebookMeta>;

async function permalinkFor(id: string, token: string): Promise<string | undefined> {
  try {
    const { permalink_url } = await graph<{ permalink_url?: string }>("GET", id, token, { fields: "permalink_url" });
    if (!permalink_url) return undefined;
    return permalink_url.startsWith("http") ? permalink_url : `https://www.facebook.com${permalink_url}`;
  } catch {
    return undefined;
  }
}

async function publishReel(page: string, token: string, videoUrl: string, description: string): Promise<string> {
  const start = await graph<{ video_id: string; upload_url: string }>("POST", `${page}/video_reels`, token, { upload_phase: "start" });
  await metaRawPost(start.upload_url ?? `https://rupload.facebook.com/video-upload/${config.metaGraphVersion}/${start.video_id}`, {
    Authorization: `OAuth ${token}`,
    file_url: videoUrl,
  });
  const done = await graph<{ success?: boolean }>("POST", `${page}/video_reels`, token, {
    upload_phase: "finish",
    video_id: start.video_id,
    video_state: "PUBLISHED",
    description,
  });
  if (!done.success) throw new PlatformError("REEL_FAILED", "Facebook didn't accept the reel.", true, done);
  return start.video_id;
}

export const facebookAdapter: PlatformAdapter<FacebookCredentials, FacebookMeta> = {
  platform: "facebook",

  async publish(channel: FbChannel, input) {
    const token = channel.credentials.pageAccessToken;
    const page = channel.meta.pageId || channel.externalId;
    const images = input.media.filter((m) => m.kind === "image");
    const video = input.media.find((m) => m.kind === "video");
    let postId: string;
    let permalink: string | undefined;

    if (video && input.format === "reel") {
      postId = await publishReel(page, token, video.url, input.text);
      permalink = `https://www.facebook.com/reel/${postId}`;
    } else if (video) {
      const res = await graph<{ id: string }>("POST", `${page}/videos`, token, { file_url: video.url, description: input.text });
      postId = res.id;
    } else if (images.length === 1) {
      const res = await graph<{ id: string; post_id?: string }>("POST", `${page}/photos`, token, { url: images[0].url, message: input.text });
      postId = res.post_id ?? res.id;
    } else if (images.length > 1) {
      const ids: string[] = [];
      for (const img of images) {
        const res = await graph<{ id: string }>("POST", `${page}/photos`, token, { url: img.url, published: false });
        ids.push(res.id);
      }
      const params: Record<string, string> = { message: input.text };
      ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
      postId = (await graph<{ id: string }>("POST", `${page}/feed`, token, params)).id;
    } else {
      postId = (await graph<{ id: string }>("POST", `${page}/feed`, token, { message: input.text })).id;
    }

    permalink ??= await permalinkFor(postId, token);
    const result: PublishResult = { platformPostId: postId, permalink };
    if (input.firstComment?.trim()) {
      try {
        await graph("POST", `${postId}/comments`, token, { message: input.firstComment });
        result.firstComment = "posted";
      } catch {
        result.firstComment = "failed";
      }
    }
    return result;
  },

  async check(channel) {
    await graph("GET", channel.meta.pageId || channel.externalId, channel.credentials.pageAccessToken, { fields: "id,name" });
  },
};
