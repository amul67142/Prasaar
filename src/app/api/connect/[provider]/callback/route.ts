import type { NextRequest } from "next/server";
import { ctxOrThrow } from "@/lib/session";
import { consumeOAuthState, createPendingConnection, upsertChannels } from "@/lib/services/channels";
import { metaCandidates } from "@/lib/platforms/connect/meta";
import { linkedinCandidates } from "@/lib/platforms/connect/linkedin";
import { mastodonCandidate } from "@/lib/platforms/connect/mastodon";
import { handleConnectError, isOAuthProvider, redirectTo, redirectWithError } from "@/lib/platforms/connect/oauth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isOAuthProvider(provider)) return redirectWithError("Unknown platform.");
  const q = req.nextUrl.searchParams;
  const state = q.get("state") ?? "";
  const code = q.get("code");

  try {
    const ctx = await ctxOrThrow();
    const stateDoc = await consumeOAuthState(ctx, state, provider);
    if (q.get("error") || !code) {
      const cancelled = q.get("error") === "access_denied" || q.get("error_reason") === "user_denied" || q.get("error") === "user_cancelled_login";
      return redirectWithError(cancelled ? "Connection cancelled." : q.get("error_description") || "The platform didn't complete the login.");
    }

    if (provider === "mastodon") {
      await upsertChannels(ctx, [await mastodonCandidate(stateDoc, code)]);
      return redirectTo("/channels?connected=mastodon");
    }

    const candidates = provider === "meta" ? await metaCandidates(code) : await linkedinCandidates(code);
    if (candidates.length === 0) {
      return redirectWithError(
        provider === "meta"
          ? "No Facebook Pages were shared. Reconnect and select the Pages (and their Instagram accounts) to add."
          : "LinkedIn didn't return any accounts.",
      );
    }
    const id = await createPendingConnection(ctx, provider, candidates);
    return redirectTo(`/channels/connect/${id}`);
  } catch (err) {
    return handleConnectError(err);
  }
}
