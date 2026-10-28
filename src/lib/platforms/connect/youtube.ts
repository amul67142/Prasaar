import "server-only";
import { appUrl, requireEnv } from "../../env";
import { AppError } from "../../errors";
import { fetchJson } from "../http";
import { describeYouTubeError, type YouTubeCredentials, type YouTubeMeta } from "../youtube";
import type { ConnectCandidate } from "../types";

// Google OAuth for the YouTube Data API. Each login picks one channel (a personal or Brand
// Account), so the callback adds it straight away.
const redirectUri = () => `${appUrl()}/api/connect/youtube/callback`;
const UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const SCOPES = [UPLOAD_SCOPE, "https://www.googleapis.com/auth/youtube.readonly"];

export function youtubeAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireEnv("YOUTUBE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    scope: SCOPES.join(" "),
    state,
    // offline + consent: Google only returns a refresh token when both are set.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export async function youtubeCandidate(code: string): Promise<ConnectCandidate> {
  const token = await fetchJson<TokenResponse>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        client_id: requireEnv("YOUTUBE_CLIENT_ID"),
        client_secret: requireEnv("YOUTUBE_CLIENT_SECRET"),
      }),
    },
    (status, body) =>
      status === 400 || status === 401
        ? { code: "OAUTH_FAILED", message: `Google didn't accept the login${(body as { error_description?: string })?.error_description ? `: ${(body as { error_description: string }).error_description}` : "."}` }
        : undefined,
  );
  // Google lets people untick individual permissions on its consent screen.
  if (!token.scope?.split(" ").includes(UPLOAD_SCOPE)) {
    throw new AppError("SCOPE_MISSING", "Prasaar needs permission to upload videos. Connect again and tick every box on Google's screen.");
  }
  if (!token.refresh_token) {
    throw new AppError("NO_REFRESH_TOKEN", "Google didn't grant lasting access. Remove Prasaar at myaccount.google.com/permissions, then connect again.");
  }

  const res = await fetchJson<{
    items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } } }[];
  }>(`https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${token.access_token}` } }, describeYouTubeError);
  const channel = res.items?.[0];
  if (!channel) throw new AppError("NO_CHANNEL", "This Google account has no YouTube channel. Create one on youtube.com, then connect again.");

  return {
    platform: "youtube",
    externalId: channel.id,
    displayName: channel.snippet.title,
    username: channel.snippet.customUrl,
    avatar: channel.snippet.thumbnails?.default?.url,
    credentials: {
      refreshToken: token.refresh_token,
      accessToken: token.access_token,
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    } satisfies YouTubeCredentials,
    meta: { channelId: channel.id, customUrl: channel.snippet.customUrl } satisfies YouTubeMeta,
  };
}
