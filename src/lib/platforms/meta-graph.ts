import "server-only";
import { createHmac } from "node:crypto";
import { config, optionalEnv } from "../env";
import { fetchJson, platformFetch } from "./http";

type Params = Record<string, string | number | boolean | undefined | null>;

/** Facebook Login tokens use graph.facebook.com; Instagram Login tokens use graph.instagram.com. */
export type GraphApi = "facebook" | "instagram";

export const graphBase = (api: GraphApi = "facebook") =>
  `https://graph.${api === "instagram" ? "instagram" : "facebook"}.com/${config.metaGraphVersion}`;

const AUTH_CODES = new Set([102, 190, 463, 467]);
const RATE_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80004, 80005, 80006]);

interface MetaErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean; error_user_msg?: string; error_user_title?: string };
}

/** Plain-language classification of Graph API errors (Facebook and Instagram). */
export function describeMetaError(status: number, body: unknown) {
  const e = (body as MetaErrorBody)?.error;
  if (!e) return undefined;
  const code = e.code ?? 0;
  const detail = e.error_user_msg || e.message || "Unknown error";
  if (AUTH_CODES.has(code)) {
    return { code: "TOKEN_INVALID", message: "Meta says the connection to this account has expired or was removed. Reconnect it.", authFailed: true, temporary: false };
  }
  if (RATE_CODES.has(code)) return { code: "RATE_LIMITED", message: "Meta is rate limiting this account; we'll retry.", temporary: true, authFailed: false };
  if (code === 10 || (code >= 200 && code < 300)) {
    return { code: "PERMISSION_DENIED", message: `Meta refused: missing permission. Reconnect the account and allow every requested permission. (${detail})`, temporary: false, authFailed: false };
  }
  if (code === 368) return { code: "BLOCKED_BY_PLATFORM", message: `Meta blocked this post for violating its policies. (${detail})`, temporary: false, authFailed: false };
  if (code === 9007 || e.error_subcode === 2207027) return { code: "MEDIA_PROCESSING", message: "Instagram is still processing the media; we'll retry.", temporary: true, authFailed: false };
  if (e.is_transient || code === 1 || code === 2 || status >= 500) return { code: "PLATFORM_UNAVAILABLE", message: `Meta had a temporary problem; we'll retry. (${detail})`, temporary: true, authFailed: false };
  return { code: "PLATFORM_REJECTED", message: `Meta rejected the post: ${detail}`, temporary: false, authFailed: false };
}

function appSecretProof(token: string): string | undefined {
  const secret = optionalEnv("META_APP_SECRET");
  return secret ? createHmac("sha256", secret).update(token).digest("hex") : undefined;
}

function encode(params: Params): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) out.set(k, String(v));
  return out;
}

/** Graph API call. The token goes in the Authorization header, never the URL. */
export async function graph<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  token: string,
  params: Params = {},
  api: GraphApi = "facebook",
): Promise<T> {
  // appsecret_proof is signed with the Facebook app secret, so it only applies to graph.facebook.com.
  const proof = api === "facebook" ? appSecretProof(token) : undefined;
  const query = encode(method === "GET" ? { ...params, appsecret_proof: proof } : { appsecret_proof: proof });
  const url = `${graphBase(api)}/${path.replace(/^\//, "")}${query.size ? `?${query}` : ""}`;
  return fetchJson<T>(
    url,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body: method === "POST" ? encode(params) : undefined,
      timeoutMs: 60_000,
    },
    describeMetaError,
  );
}

/** For OAuth endpoints that take app credentials instead of a user token. */
export async function graphPublic<T>(path: string, params: Params): Promise<T> {
  return fetchJson<T>(`${graphBase()}/${path.replace(/^\//, "")}?${encode(params)}`, {}, describeMetaError);
}

/** Raw POST outside graph.facebook.com (rupload for reels). */
export async function metaRawPost(url: string, headers: Record<string, string>) {
  const res = await platformFetch(url, { method: "POST", headers, timeoutMs: 120_000 }, describeMetaError);
  return res.json() as Promise<unknown>;
}
