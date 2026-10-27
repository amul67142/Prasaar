import "server-only";
import { NextResponse } from "next/server";
import { appUrl, MissingEnvError } from "../../env";
import { isAppError } from "../../errors";
import { PlatformError } from "../types";

export const OAUTH_PROVIDERS = ["meta", "linkedin", "mastodon"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

export function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, appUrl()), 303);
}

export function redirectWithError(message: string) {
  return redirectTo(`/channels?error=${encodeURIComponent(message)}`);
}

/** Converts an error into a redirect, but lets Next.js redirect()/notFound() signals through. */
export function handleConnectError(err: unknown) {
  if (err && typeof err === "object" && "digest" in err) throw err;
  if (isAppError(err)) {
    if (err.status === 401) return redirectTo("/login?next=%2Fchannels");
    return redirectWithError(err.message);
  }
  if (err instanceof PlatformError) return redirectWithError(err.message);
  if (err instanceof MissingEnvError) {
    console.error("[connect]", err.message);
    return redirectWithError(`This platform isn't set up on the server yet (${err.envName} is missing). Add it in Vercel and redeploy.`);
  }
  console.error("[connect]", err);
  return redirectWithError("Something went wrong while connecting. Please try again.");
}
