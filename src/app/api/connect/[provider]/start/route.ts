import { NextResponse, type NextRequest } from "next/server";
import { ctxOrThrow } from "@/lib/session";
import { createOAuthState } from "@/lib/services/channels";
import { instagramAuthorizeUrl } from "@/lib/platforms/connect/instagram";
import { metaAuthorizeUrl } from "@/lib/platforms/connect/meta";
import { linkedinAuthorizeUrl } from "@/lib/platforms/connect/linkedin";
import { youtubeAuthorizeUrl } from "@/lib/platforms/connect/youtube";
import { startMastodonConnect } from "@/lib/platforms/connect/mastodon";
import { handleConnectError, isOAuthProvider, redirectWithError } from "@/lib/platforms/connect/oauth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isOAuthProvider(provider)) return redirectWithError("Unknown platform.");
  try {
    const ctx = await ctxOrThrow();
    let url: string;
    if (provider === "mastodon") {
      url = await startMastodonConnect(ctx, req.nextUrl.searchParams.get("instance") ?? "");
    } else {
      const state = await createOAuthState(ctx, provider);
      url =
        provider === "meta"
          ? metaAuthorizeUrl(state)
          : provider === "instagram"
            ? instagramAuthorizeUrl(state)
            : provider === "youtube"
              ? youtubeAuthorizeUrl(state)
              : linkedinAuthorizeUrl(state);
    }
    return NextResponse.redirect(url, 303);
  } catch (err) {
    return handleConnectError(err);
  }
}
