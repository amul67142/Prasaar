import "server-only";
import { AppError } from "../../errors";
import type { Ctx } from "../../session";
import { assertCan } from "../../session";
import { upsertChannels, type ChannelView } from "../../services/channels";
import { BLUESKY_DEFAULT_SERVICE, blueskyLogin, type BlueskyCredentials, type BlueskyMeta } from "../bluesky";
import { PlatformError } from "../types";
import { assertPublicHttpsOrigin } from "./safe-url";

// App passwords look like abcd-efgh-ijkl-mnop. Requiring the format keeps main passwords out of our database.
const APP_PASSWORD_RE = /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/;

export async function connectBluesky(
  ctx: Ctx,
  input: { identifier: string; appPassword: string; service?: string },
): Promise<ChannelView[]> {
  assertCan(ctx, "channel:manage");
  const identifier = input.identifier.trim().replace(/^@/, "");
  if (!identifier) throw new AppError("INVALID_HANDLE", "Enter your Bluesky handle, for example name.bsky.social.", 400, "identifier");
  const appPassword = input.appPassword.trim().toLowerCase();
  if (!APP_PASSWORD_RE.test(appPassword)) {
    throw new AppError("APP_PASSWORD_REQUIRED", "Use an app password (like abcd-efgh-ijkl-mnop), not your main Bluesky password.", 400, "appPassword");
  }
  const service = input.service?.trim()
    ? await assertPublicHttpsOrigin(/^https?:\/\//i.test(input.service.trim()) ? input.service.trim() : `https://${input.service.trim()}`, "Bluesky server")
    : BLUESKY_DEFAULT_SERVICE;

  let agent;
  try {
    agent = await blueskyLogin(service, identifier, appPassword);
  } catch (err) {
    if (err instanceof PlatformError && err.authFailed) throw new AppError("INVALID_LOGIN", "Bluesky didn't accept that handle and app password.", 400, "appPassword");
    if (err instanceof PlatformError) throw new AppError(err.code, err.message, 400);
    throw err;
  }
  const did = agent.session!.did;
  const handle = agent.session!.handle;
  let displayName = handle;
  let avatar: string | undefined;
  try {
    const { data } = await agent.getProfile({ actor: did });
    displayName = data.displayName || handle;
    avatar = data.avatar;
  } catch {}

  return upsertChannels(ctx, [
    {
      platform: "bluesky",
      externalId: did,
      displayName,
      username: `@${handle}`,
      avatar,
      credentials: { identifier: did, appPassword } satisfies BlueskyCredentials,
      meta: { did, handle, service } satisfies BlueskyMeta,
    },
  ]);
}
