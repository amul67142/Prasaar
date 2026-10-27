import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "./crypto";
import { optionalEnv } from "./env";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function cronHandler(run: () => Promise<unknown>) {
  return async (req: NextRequest) => {
    const secret = optionalEnv("CRON_SECRET");
    const header = req.headers.get("authorization") ?? "";
    if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Bad cron secret" } }, { status: 401 });
    }
    return NextResponse.json(await run());
  };
}
