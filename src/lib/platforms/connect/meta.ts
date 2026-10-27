import "server-only";
import { createHmac } from "node:crypto";
import { appUrl, config, optionalEnv, requireEnv } from "../../env";
import { safeEqual } from "../../crypto";
import { graph, graphPublic } from "../meta-graph";
import type { ConnectCandidate } from "../types";
import type { FacebookCredentials, FacebookMeta } from "../facebook";

// Facebook Pages only. Instagram connects through Instagram Login (connect/instagram.ts).
export const META_SCOPES = ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "business_management"];

const redirectUri = () => `${appUrl()}/api/connect/meta/callback`;

export function metaAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("META_APP_ID"),
    redirect_uri: redirectUri(),
    state,
    response_type: "code",
  });
  // Facebook Login for Business uses a configuration id instead of a scope list.
  const configId = optionalEnv("META_LOGIN_CONFIG_ID");
  if (configId) params.set("config_id", configId);
  else params.set("scope", META_SCOPES.join(","));
  return `https://www.facebook.com/${config.metaGraphVersion}/dialog/oauth?${params}`;
}

interface PageRow {
  id: string;
  name: string;
  access_token?: string;
  tasks?: string[];
  picture?: { data?: { url?: string } };
}

export async function metaCandidates(code: string): Promise<ConnectCandidate[]> {
  const appId = requireEnv("META_APP_ID");
  const appSecret = requireEnv("META_APP_SECRET");
  const short = await graphPublic<{ access_token: string }>("oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri(),
    code,
  });
  // Page tokens fetched with a long-lived user token don't expire.
  const long = await graphPublic<{ access_token: string }>("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: short.access_token,
  });
  const userToken = long.access_token;
  const me = await graph<{ id: string }>("GET", "me", userToken, { fields: "id" });

  const pages: PageRow[] = [];
  let after: string | undefined;
  for (let i = 0; i < 10; i++) {
    const res = await graph<{ data: PageRow[]; paging?: { cursors?: { after?: string }; next?: string } }>("GET", "me/accounts", userToken, {
      fields: "id,name,access_token,tasks,picture{url}",
      limit: 100,
      after,
    });
    pages.push(...res.data);
    after = res.paging?.next ? res.paging.cursors?.after : undefined;
    if (!after) break;
  }

  const candidates: ConnectCandidate[] = [];
  for (const page of pages) {
    const canPost = !page.tasks || page.tasks.includes("CREATE_CONTENT") || page.tasks.includes("MANAGE");
    const reason = !page.access_token
      ? "Facebook didn't share access to this Page."
      : !canPost
        ? "Your role on this Page can't create posts."
        : undefined;
    const fb: ConnectCandidate = {
      platform: "facebook",
      externalId: page.id,
      displayName: page.name,
      avatar: page.picture?.data?.url,
      credentials: { pageAccessToken: page.access_token ?? "" } satisfies FacebookCredentials,
      meta: { pageId: page.id, userId: me.id } satisfies FacebookMeta,
      unavailableReason: reason,
    };
    candidates.push(fb);
  }
  return candidates;
}

/** Verifies and decodes a Meta `signed_request` (data deletion and deauthorize callbacks). */
export function parseMetaSignedRequest(signedRequest: string): { user_id: string; issued_at?: number } | null {
  // Facebook Login callbacks are signed with the app secret, Instagram Login ones with the Instagram app secret.
  const secrets = [optionalEnv("META_APP_SECRET"), optionalEnv("INSTAGRAM_APP_SECRET")].filter(Boolean) as string[];
  const [sig, payload] = signedRequest.split(".");
  if (!secrets.length || !sig || !payload) return null;
  const given = sig.replace(/=+$/, "");
  if (!secrets.some((secret) => safeEqual(createHmac("sha256", secret).update(payload).digest("base64url"), given))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { algorithm?: string; user_id?: string; issued_at?: number };
    if (data.algorithm?.toUpperCase() !== "HMAC-SHA256" || !data.user_id) return null;
    return { user_id: String(data.user_id), issued_at: data.issued_at };
  } catch {
    return null;
  }
}
