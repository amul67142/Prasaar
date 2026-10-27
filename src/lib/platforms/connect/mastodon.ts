import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../../db/mongo";
import { MastodonApp, type OAuthStateDoc } from "../../db/models";
import { decrypt, encrypt } from "../../crypto";
import { appUrl } from "../../env";
import { AppError } from "../../errors";
import type { Ctx } from "../../session";
import { createOAuthState } from "../../services/channels";
import { fetchJson } from "../http";
import { describeMastodonError, type MastodonCredentials, type MastodonMeta } from "../mastodon";
import type { ConnectCandidate } from "../types";
import { assertPublicHttpsOrigin } from "./safe-url";

const SCOPES = "read write:media write:statuses";
const redirectUri = () => `${appUrl()}/api/connect/mastodon/callback`;

/** Accepts "mastodon.social", "@user@mastodon.social", "user@host" or a full URL. */
export async function normalizeInstance(input: string): Promise<string> {
  let value = input.trim();
  if (!value) throw new AppError("INVALID_SERVER", "Enter your Mastodon server, for example mastodon.social.", 400, "instance");
  if (!/^https?:\/\//i.test(value) && value.includes("@")) value = value.split("@").filter(Boolean).pop() ?? "";
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return assertPublicHttpsOrigin(value.toLowerCase(), "Mastodon server");
}

async function getOrRegisterApp(instance: string) {
  await db();
  const redirect = redirectUri();
  const existing = await MastodonApp.findOne({ instance, redirectUri: redirect }).lean();
  if (existing) return { clientId: existing.clientId, clientSecret: decrypt(existing.clientSecretEnc) };

  const app = await fetchJson<{ client_id: string; client_secret: string }>(
    `${instance}/api/v1/apps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Prasaar", redirect_uris: redirect, scopes: SCOPES, website: appUrl() }),
    },
    describeMastodonError,
  );
  await MastodonApp.updateOne(
    { instance, redirectUri: redirect },
    { $setOnInsert: { clientId: app.client_id, clientSecretEnc: encrypt(app.client_secret) } },
    { upsert: true },
  );
  return { clientId: app.client_id, clientSecret: app.client_secret };
}

/** Registers our app on the server if needed and returns the URL to send the user to. */
export async function startMastodonConnect(ctx: Ctx, instanceInput: string): Promise<string> {
  const instance = await normalizeInstance(instanceInput);
  let app;
  try {
    app = await getOrRegisterApp(instance);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("INVALID_SERVER", `We couldn't register with ${new URL(instance).host}. Is it a Mastodon server?`, 400, "instance");
  }
  const codeVerifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const state = await createOAuthState(ctx, "mastodon", { codeVerifier, meta: { instance } });
  const params = new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${instance}/oauth/authorize?${params}`;
}

export async function mastodonCandidate(stateDoc: Pick<OAuthStateDoc, "codeVerifier" | "meta">, code: string): Promise<ConnectCandidate> {
  const instance = (stateDoc.meta as { instance?: string })?.instance;
  if (!instance) throw new AppError("OAUTH_STATE_INVALID", "This login attempt expired. Please try connecting again.");
  const app = await getOrRegisterApp(instance);

  const token = await fetchJson<{ access_token: string }>(
    `${instance}/oauth/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: app.clientId,
        client_secret: app.clientSecret,
        redirect_uri: redirectUri(),
        scope: SCOPES,
        ...(stateDoc.codeVerifier ? { code_verifier: stateDoc.codeVerifier } : {}),
      }),
    },
    describeMastodonError,
  );
  const auth = { Authorization: `Bearer ${token.access_token}` };
  const account = await fetchJson<{ id: string; username: string; display_name?: string; avatar?: string }>(
    `${instance}/api/v1/accounts/verify_credentials`,
    { headers: auth },
    describeMastodonError,
  );
  let maxChars = 500;
  try {
    const info = await fetchJson<{ configuration?: { statuses?: { max_characters?: number } } }>(`${instance}/api/v2/instance`, {}, describeMastodonError);
    maxChars = info.configuration?.statuses?.max_characters ?? maxChars;
  } catch {}

  const host = new URL(instance).host;
  const username = `@${account.username}@${host}`;
  return {
    platform: "mastodon",
    externalId: `${account.id}@${host}`,
    displayName: account.display_name || account.username,
    username,
    avatar: account.avatar,
    credentials: { accessToken: token.access_token } satisfies MastodonCredentials,
    meta: { instance, accountId: account.id, username, maxChars } satisfies MastodonMeta,
  };
}
