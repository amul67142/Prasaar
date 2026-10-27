import "server-only";
import { config, optionalEnv } from "../env";
import { downloadMedia, fetchJson, platformFetch, sleep } from "./http";
import { PLATFORM_RULES } from "./rules";
import { PlatformError, type AdapterChannel, type AdapterMedia, type PlatformAdapter, type PublishResult } from "./types";

export interface LinkedInCredentials {
  accessToken: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
}
export interface LinkedInMeta {
  authorUrn: string;
  kind: "person" | "organization";
}

type LiChannel = AdapterChannel<LinkedInCredentials, LinkedInMeta>;

const API = "https://api.linkedin.com/rest";

export function describeLinkedInError(status: number, body: unknown) {
  const b = body as { message?: string; serviceErrorCode?: number; code?: string } | undefined;
  const detail = b?.message ?? "";
  if (status === 401) return { code: "TOKEN_INVALID", message: "LinkedIn says the connection has expired. Reconnect the account.", authFailed: true };
  if (status === 403)
    return { code: "PERMISSION_DENIED", message: `LinkedIn refused: this account or app lacks permission to post here.${detail ? ` (${detail})` : ""}`, temporary: false };
  if (status === 422 && /duplicate/i.test(detail)) return { code: "DUPLICATE_POST", message: "LinkedIn rejected this as a duplicate of a recent post.", temporary: false };
  if (status === 429) return { code: "RATE_LIMITED", message: "LinkedIn's daily posting limit or rate limit was reached; we'll retry.", temporary: true };
  if (status >= 500) return { code: "PLATFORM_UNAVAILABLE", message: "LinkedIn had a temporary problem; we'll retry.", temporary: true };
  if (status === 400 || status === 422) return { code: "PLATFORM_REJECTED", message: `LinkedIn rejected the post${detail ? `: ${detail}` : "."}`, temporary: false };
  return undefined;
}

function headers(token: string, json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": config.linkedinVersion,
    "X-Restli-Protocol-Version": "2.0.0",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

const li = <T>(token: string, path: string, init: RequestInit = {}) =>
  fetchJson<T>(`${API}${path}`, { ...init, headers: { ...headers(token), ...(init.headers as Record<string, string>) }, timeoutMs: 60_000 }, describeLinkedInError);

/** LinkedIn "little text": escape reserved characters, keep hashtags clickable. */
export function toLittleText(text: string): string {
  const escape = (s: string) => s.replace(/[\\|{}@[\]()<>#*_~]/g, "\\$&");
  let out = "";
  let last = 0;
  for (const m of text.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    out += escape(text.slice(last, m.index));
    out += `{hashtag|\\#|${m[1]}}`;
    last = m.index! + m[0].length;
  }
  return out + escape(text.slice(last));
}

async function waitAvailable(token: string, kind: "videos" | "documents" | "images", urn: string) {
  const deadline = Date.now() + 4 * 60_000;
  let delay = 2000;
  for (;;) {
    const res = await li<{ status?: string }>(token, `/${kind}/${encodeURIComponent(urn)}`, { method: "GET" });
    if (res.status === "AVAILABLE") return;
    if (res.status === "PROCESSING_FAILED") throw new PlatformError("MEDIA_REJECTED", "LinkedIn couldn't process the file.");
    if (Date.now() + delay > deadline) throw new PlatformError("MEDIA_PROCESSING", "LinkedIn is still processing the file; we'll retry.", true);
    await sleep(delay);
    delay = Math.min(delay * 1.5, 15_000);
  }
}

async function putBytes(url: string, token: string, body: Blob, extraHeaders: Record<string, string> = {}) {
  return platformFetch(
    url,
    { method: "PUT", body, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream", ...extraHeaders }, timeoutMs: 300_000 },
    describeLinkedInError,
  );
}

async function uploadImage(token: string, owner: string, m: AdapterMedia): Promise<string> {
  const init = await li<{ value: { uploadUrl: string; image: string } }>(token, "/images?action=initializeUpload", {
    method: "POST",
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  await putBytes(init.value.uploadUrl, token, await downloadMedia(m.url, PLATFORM_RULES.linkedin.maxBytes.image));
  return init.value.image;
}

async function uploadDocument(token: string, owner: string, m: AdapterMedia): Promise<string> {
  const init = await li<{ value: { uploadUrl: string; document: string } }>(token, "/documents?action=initializeUpload", {
    method: "POST",
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  await putBytes(init.value.uploadUrl, token, await downloadMedia(m.url, PLATFORM_RULES.linkedin.maxBytes.document));
  await waitAvailable(token, "documents", init.value.document);
  return init.value.document;
}

async function uploadVideo(token: string, owner: string, m: AdapterMedia): Promise<string> {
  const file = await downloadMedia(m.url, PLATFORM_RULES.linkedin.maxBytes.video);
  const init = await li<{
    value: { video: string; uploadToken?: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] };
  }>(token, "/videos?action=initializeUpload", {
    method: "POST",
    body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes: file.size, uploadCaptions: false, uploadThumbnail: false } }),
  });
  const etags: string[] = [];
  for (const part of init.value.uploadInstructions) {
    const res = await putBytes(part.uploadUrl, token, file.slice(part.firstByte, part.lastByte + 1));
    const etag = res.headers.get("etag");
    if (!etag) throw new PlatformError("UPLOAD_FAILED", "LinkedIn didn't confirm a video upload part.", true);
    etags.push(etag);
  }
  await platformFetch(
    `${API}/videos?action=finalizeUpload`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ finalizeUploadRequest: { video: init.value.video, uploadToken: init.value.uploadToken ?? "", uploadedPartIds: etags } }),
    },
    describeLinkedInError,
  );
  await waitAvailable(token, "videos", init.value.video);
  return init.value.video;
}

export const linkedinAdapter: PlatformAdapter<LinkedInCredentials, LinkedInMeta> = {
  platform: "linkedin",

  async publish(channel: LiChannel, input) {
    const token = channel.credentials.accessToken;
    const author = channel.meta.authorUrn;
    const images = input.media.filter((m) => m.kind === "image");
    const video = input.media.find((m) => m.kind === "video");
    const doc = input.media.find((m) => m.kind === "document");

    let content: Record<string, unknown> | undefined;
    if (doc) content = { media: { id: await uploadDocument(token, author, doc), title: doc.filename.replace(/\.pdf$/i, "") || "Document" } };
    else if (video) content = { media: { id: await uploadVideo(token, author, video) } };
    else if (images.length === 1) content = { media: { id: await uploadImage(token, author, images[0]) } };
    else if (images.length > 1) {
      const ids: string[] = [];
      for (const img of images) ids.push(await uploadImage(token, author, img));
      content = { multiImage: { images: ids.map((id) => ({ id, altText: "" })) } };
    }

    const res = await platformFetch(
      `${API}/posts`,
      {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
          author,
          commentary: toLittleText(input.text),
          visibility: "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
          ...(content ? { content } : {}),
        }),
        timeoutMs: 60_000,
      },
      describeLinkedInError,
    );
    const urn = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
    if (!urn) throw new PlatformError("NO_POST_ID", "LinkedIn accepted the post but didn't return its id.", false);

    const result: PublishResult = { platformPostId: urn, permalink: `https://www.linkedin.com/feed/update/${urn}` };
    if (input.firstComment?.trim()) {
      try {
        await li(token, `/socialActions/${encodeURIComponent(urn)}/comments`, {
          method: "POST",
          body: JSON.stringify({ actor: author, object: urn, message: { text: input.firstComment } }),
        });
        result.firstComment = "posted";
      } catch {
        result.firstComment = "failed";
      }
    }
    return result;
  },

  async check(channel) {
    await fetchJson("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${channel.credentials.accessToken}` } }, describeLinkedInError);
  },

  async refresh(channel) {
    const { refreshToken, refreshTokenExpiresAt } = channel.credentials;
    if (!refreshToken || (refreshTokenExpiresAt && new Date(refreshTokenExpiresAt) <= new Date())) {
      throw new PlatformError("TOKEN_EXPIRING", "LinkedIn needs you to reconnect this account.", false, undefined, true);
    }
    const res = await fetchJson<{ access_token: string; expires_in: number; refresh_token?: string; refresh_token_expires_in?: number }>(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: optionalEnv("LINKEDIN_CLIENT_ID") ?? "",
          client_secret: optionalEnv("LINKEDIN_CLIENT_SECRET") ?? "",
        }),
      },
      (status) => (status === 400 || status === 401 ? { code: "TOKEN_INVALID", message: "LinkedIn needs you to reconnect this account.", authFailed: true } : undefined),
    );
    return {
      credentials: {
        accessToken: res.access_token,
        refreshToken: res.refresh_token ?? refreshToken,
        refreshTokenExpiresAt: res.refresh_token_expires_in
          ? new Date(Date.now() + res.refresh_token_expires_in * 1000).toISOString()
          : refreshTokenExpiresAt,
      },
      tokenExpiresAt: new Date(Date.now() + res.expires_in * 1000),
    };
  },
};
