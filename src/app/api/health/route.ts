import { NextResponse } from "next/server";
import { db } from "@/lib/db/mongo";
import { appUrl, optionalEnv } from "@/lib/env";

// Which services are configured (yes/no only, never values) and whether the database answers.
export async function GET() {
  const set = (...names: string[]) => names.every((n) => Boolean(optionalEnv(n)));
  let database: "ok" | "error" | "not configured" = "not configured";
  if (set("MONGODB_URI")) {
    try {
      const conn = await Promise.race([db(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))]);
      await conn.connection.db!.admin().command({ ping: 1 });
      database = "ok";
    } catch {
      database = "error";
    }
  }
  return NextResponse.json(
    {
      appUrl: appUrl(),
      database,
      configured: {
        auth: set("AUTH_SECRET"),
        encryption: set("ENCRYPTION_KEY"),
        meta: set("META_APP_ID", "META_APP_SECRET"),
        linkedin: set("LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"),
        qstash: set("QSTASH_TOKEN", "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY"),
        email: set("RESEND_API_KEY"),
        uploads: set("UPLOAD_BASE_URL", "CDN_BASE_URL", "UPLOAD_SIGNING_SECRET"),
        cron: set("CRON_SECRET"),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
