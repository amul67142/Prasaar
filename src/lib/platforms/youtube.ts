import "server-only";
import { requireEnv } from "../env";
import { downloadMedia, fetchJson, platformFetch } from "./http";
import { YOUTUBE_THUMBNAIL, youtubeTitle } from "./rules";
import { PlatformError, type AdapterChannel, type AdapterMedia, type PlatformAdapter } from "./types";

export interface YouTubeCredentials {
  refreshToken: string;
  /** Short-lived (1 hour); refreshed from the refresh token whenever it's stale. */
  accessToken?: string;
  accessTokenExpiresAt?: string;
}
export interface YouTubeMeta {
  channelId: string;
  customUrl?: string;
}

type YtChannel = AdapterChannel<YouTubeCredentials, YouTubeMeta>;

const API = "https://www.googleapis.com/youtube/v3";
// Resumable upload chunks must be multiples of 256 KiB.
const CHUNK = 32 * 1024 * 1024;

export function describeYouTubeError(status: number, body: unknown) {
  const e = (body as { error?: { message?: string; errors?: { reason?: string }[] } } | undefined)?.error;
  const reason = e?.errors?.[0]?.reason ?? "";
  const detail = e?.message ?? "";
  if (status === 401) return { code: "TOKEN_INVALID", message: "YouTube says the connection has expired. Reconnect the channel.", authFailed: true };
  if (reason === "quotaExceeded")
    return { code: "QUOTA_EXCEEDED", message: "Prasaar's daily YouTube upload quota is used up. It resets at 12:30 PM IST; try again then.", temporary: false };
  if (reason === "uploadLimitExceeded")
    return { code: "UPLOAD_LIMIT", message: "This channel has hit YouTube's daily upload limit. Try again tomorrow.", temporary: false };
  if (reason === "youtubeSignupRequired" || reason === "channelNotFound")
    return { code: "NO_CHANNEL", message: "This Google account has no YouTube channel. Create one on youtube.com, then reconnect.", authFailed: true };
  if (status === 403 && /insufficient|scope|permission/i.test(`${reason} ${detail}`))
    return { code: "PERMISSION_DENIED", message: "Prasaar isn't allowed to upload to this channel. Reconnect and tick every permission on Google's screen.", authFailed: true };
  if (status === 429 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded")
    return { code: "RATE_LIMITED", message: "YouTube is rate limiting us; we'll retry.", temporary: true };
  if (status >= 500) return { code: "PLATFORM_UNAVAILABLE", message: "YouTube had a temporary problem; we'll retry.", temporary: true };
  if (status === 400 || status === 403)
    return { code: "PLATFORM_REJECTED", message: `YouTube rejected the video${detail ? `: ${detail}` : "."}`, temporary: false };
  return undefined;
}

/** Exchanges the refresh token for an access token. Google access tokens last an hour. */
export async function youtubeAccessToken(credentials: YouTubeCredentials): Promise<string> {
  const { accessToken, accessTokenExpiresAt, refreshToken } = credentials;
  if (accessToken && accessTokenExpiresAt && Date.parse(accessTokenExpiresAt) > Date.now() + 5 * 60_000) return accessToken;
  const res = await fetchJson<{ access_token: string }>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: requireEnv("YOUTUBE_CLIENT_ID"),
        client_secret: requireEnv("YOUTUBE_CLIENT_SECRET"),
      }),
    },
    (status) =>
      status === 400 || status === 401
        ? { code: "TOKEN_INVALID", message: "YouTube access was revoked or expired. Reconnect the channel.", authFailed: true }
        : undefined,
  );
  return res.access_token;
}

/** Reads part of our stored file. Falls back to the whole file if the host ignores Range. */
async function readRange(m: AdapterMedia, start: number, end: number, cache: { whole?: Blob }): Promise<Blob> {
  if (cache.whole) return cache.whole.slice(start, end + 1);
  const res = await platformFetch(m.url, { headers: { Range: `bytes=${start}-${end}` }, timeoutMs: 120_000 });
  if (res.status === 206) return res.blob();
  cache.whole = await res.blob();
  return cache.whole.slice(start, end + 1);
}

/** Sends one chunk. Returns the uploaded video on the last one, or the next offset YouTube expects. */
async function putChunk(session: string, chunk: Blob, start: number, total: number): Promise<{ id: string } | number> {
  let res: Response;
  try {
    res = await fetch(session, {
      method: "PUT",
      body: chunk,
      redirect: "manual",
      headers: { "Content-Range": `bytes ${start}-${start + chunk.size - 1}/${total}` },
      signal: AbortSignal.timeout(180_000),
    });
  } catch (err) {
    throw new PlatformError("NETWORK_ERROR", "The upload to YouTube was interrupted; we'll retry.", true, String(err));
  }
  if (res.status === 200 || res.status === 201) return (await res.json()) as { id: string };
  if (res.status === 308) {
    const range = res.headers.get("range");
    return range ? Number(range.split("-")[1]) + 1 : 0;
  }
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {}
  const d = describeYouTubeError(res.status, body);
  throw new PlatformError(d?.code ?? `HTTP_${res.status}`, d?.message ?? `YouTube rejected the upload (HTTP ${res.status}).`, d?.temporary ?? res.status >= 500, body, d?.authFailed ?? false);
}

function describeThumbnailError(status: number, body: unknown) {
  const reason = (body as { error?: { errors?: { reason?: string }[] } } | undefined)?.error?.errors?.[0]?.reason ?? "";
  if (status === 403 && reason === "forbidden")
    return { code: "THUMBNAIL_NOT_ALLOWED", message: "custom thumbnails need a phone-verified channel (youtube.com/verify)." };
  if (status === 400 || status === 413) return { code: "THUMBNAIL_REJECTED", message: "the image must be a JPEG or PNG under 2 MB." };
  return describeYouTubeError(status, body);
}

async function setThumbnail(token: string, videoId: string, image: AdapterMedia) {
  const bytes = await downloadMedia(image.url, YOUTUBE_THUMBNAIL.maxBytes);
  await platformFetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": image.mime }, body: bytes, timeoutMs: 60_000 },
    describeThumbnailError,
  );
}

export const youtubeAdapter: PlatformAdapter<YouTubeCredentials, YouTubeMeta> = {
  platform: "youtube",

  async publish(channel: YtChannel, input) {
    const video = input.media.find((m) => m.kind === "video");
    if (!video) throw new PlatformError("VIDEO_REQUIRED", "YouTube needs a video.");
    const token = await youtubeAccessToken(channel.credentials);
    const o = input.youtube ?? {};

    // 1. Start a resumable upload session with the video's details.
    const parts = ["snippet", "status", ...(o.paidPromotion ? ["paidProductPlacementDetails"] : [])];
    const query = new URLSearchParams({ uploadType: "resumable", part: parts.join(","), notifySubscribers: String(o.notifySubscribers ?? true) });
    const init = await platformFetch(
      `https://www.googleapis.com/upload/youtube/v3/videos?${query}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(video.sizeBytes),
          "X-Upload-Content-Type": video.mime,
        },
        body: JSON.stringify({
          snippet: {
            title: youtubeTitle(o.title, input.text, video.filename),
            description: input.text,
            categoryId: o.categoryId ?? "22",
            ...(o.tags?.length ? { tags: o.tags } : {}),
          },
          status: {
            privacyStatus: o.privacy ?? "public",
            selfDeclaredMadeForKids: o.madeForKids ?? false,
            embeddable: o.embeddable ?? true,
            ...(o.aiContent ? { containsSyntheticMedia: true } : {}),
          },
          ...(o.paidPromotion ? { paidProductPlacementDetails: { hasPaidProductPlacement: true } } : {}),
        }),
        timeoutMs: 60_000,
      },
      describeYouTubeError,
    );
    const session = init.headers.get("location");
    if (!session) throw new PlatformError("UPLOAD_FAILED", "YouTube didn't start the upload; we'll retry.", true);

    // 2. Stream the file across in chunks, so large videos never sit in memory whole.
    const cache: { whole?: Blob } = {};
    let offset = 0;
    for (let guard = 0; guard < 2000; guard++) {
      const end = Math.min(offset + CHUNK, video.sizeBytes) - 1;
      const result = await putChunk(session, await readRange(video, offset, end, cache), offset, video.sizeBytes);
      if (typeof result === "object") {
        const short = input.format === "reel";
        const warnings: string[] = [];
        // 3. The video is live either way; a refused thumbnail is only a warning.
        if (input.thumbnail && !short) {
          try {
            await setThumbnail(token, result.id, input.thumbnail);
          } catch (err) {
            warnings.push(`The video is up, but YouTube didn't accept the thumbnail: ${err instanceof Error ? err.message : "unknown error"}`);
          }
        }
        return {
          platformPostId: result.id,
          permalink: short ? `https://www.youtube.com/shorts/${result.id}` : `https://www.youtube.com/watch?v=${result.id}`,
          warnings: warnings.length ? warnings : undefined,
          raw: result,
        };
      }
      offset = result;
    }
    throw new PlatformError("UPLOAD_FAILED", "YouTube didn't finish receiving the video; we'll retry.", true);
  },

  async check(channel) {
    const token = await youtubeAccessToken(channel.credentials);
    await fetchJson(`${API}/channels?part=id&mine=true`, { headers: { Authorization: `Bearer ${token}` } }, describeYouTubeError);
  },
};
