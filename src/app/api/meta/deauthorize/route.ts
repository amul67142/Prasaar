import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/mongo";
import { Channel } from "@/lib/db/models";
import { parseMetaSignedRequest } from "@/lib/platforms/connect/meta";

// Called by Meta when a user removes our app from their Facebook settings.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const data = parseMetaSignedRequest(String(form?.get("signed_request") ?? ""));
  if (!data) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });

  await db();
  await Channel.updateMany(
    { platform: { $in: ["facebook", "instagram"] }, "meta.userId": data.user_id },
    { status: "revoked", lastError: "Access to Prasaar was removed in Facebook settings. Reconnect to keep posting." },
  );
  return NextResponse.json({ ok: true });
}
