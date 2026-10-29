import "server-only";
import { appUrl, requireEnv } from "../../env";
import { AppError } from "../../errors";
import { fetchJson } from "../http";
import type { InstagramCredentials, InstagramMeta } from "../instagram";
import { describeMetaError, graph } from "../meta-graph";
import type { ConnectCandidate } from "../types";

// Instagram API with Instagram Login: the user signs in on instagram.com directly, no Facebook Page needed.
// Works for Business and Creator accounts. App credentials come from the Meta app's Instagram product.
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
  "instagram_business_manage_insights",
];

const redirectUri = () => `${appUrl()}/api/connect/instagram/callback`;

export function instagramAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("INSTAGRAM_APP_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params}`;
}

type ShortToken = { access_token: string; user_id: string | number };

export async function instagramCandidate(code: string): Promise<ConnectCandidate> {
  const appId = requireEnv("INSTAGRAM_APP_ID");
  const secret = requireEnv("INSTAGRAM_APP_SECRET");

  const res = await fetchJson<ShortToken | { data: ShortToken[] }>(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: appId, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri(), code }),
    },
    describeMetaError,
  );
  const short = "data" in res ? res.data[0] : res;
  if (!short?.access_token) throw new AppError("INSTAGRAM_NO_TOKEN", "Instagram didn't complete the login. Please try again.");

  // Swap the 1-hour token for a 60-day one; the token cron renews it before it runs out.
  const long = await fetchJson<{ access_token: string; expires_in?: number }>(
    `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: secret, access_token: short.access_token })}`,
    {},
    describeMetaError,
  );

  const me = await graph<{ id: string; user_id?: string; username?: string; name?: string; profile_picture_url?: string; account_type?: string }>(
    "GET",
    "me",
    long.access_token,
    { fields: "id,user_id,username,name,profile_picture_url,account_type" },
    "instagram",
  );
  if (me.account_type && !["BUSINESS", "MEDIA_CREATOR"].includes(me.account_type)) {
    throw new AppError(
      "INSTAGRAM_NOT_PROFESSIONAL",
      "Only Instagram Business or Creator accounts can be connected. Switch the account type in Instagram's settings, then try again.",
    );
  }

  const igUserId = String(me.user_id ?? short.user_id);
  return {
    platform: "instagram",
    externalId: igUserId,
    displayName: me.name || me.username || "Instagram",
    username: me.username,
    avatar: me.profile_picture_url,
    credentials: { accessToken: long.access_token } satisfies InstagramCredentials,
    meta: { loginType: "instagram", igUserId, userId: String(me.id), username: me.username } satisfies InstagramMeta,
    tokenExpiresAt: new Date(Date.now() + (long.expires_in ?? 60 * 86_400) * 1000).toISOString(),
  };
}
