import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: sends logged-out visitors to /login without rendering the app.
// Real authorisation happens in requireCtx() next to the data.
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("authjs.session-token") || req.cookies.has("__Secure-authjs.session-token");
  if (hasSession) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

// Must be a literal: Next.js reads it at build time.
export const config = {
  matcher: [
    "/home/:path*",
    "/calendar/:path*",
    "/analytics/:path*",
    "/api-keys/:path*",
    "/mcp/:path*",
    "/compose/:path*",
    "/posts/:path*",
    "/queue/:path*",
    "/media/:path*",
    "/channels/:path*",
    "/team/:path*",
    "/settings/:path*",
  ],
};
