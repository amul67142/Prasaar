import { NextResponse, type NextRequest } from "next/server";
import { isAppError } from "@/lib/errors";
import { verifyEmail } from "@/lib/services/accounts";

// A route handler, not a page, so the one-time token is only consumed by the real request.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const url = req.nextUrl.clone();
  url.search = "";
  try {
    await verifyEmail(token);
    url.pathname = "/login";
    url.searchParams.set("verified", "1");
  } catch (err) {
    if (!isAppError(err)) throw err;
    url.pathname = "/verify";
    url.searchParams.set("invalid", "1");
  }
  return NextResponse.redirect(url);
}
