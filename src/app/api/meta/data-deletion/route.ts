import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/mongo";
import { Channel, DeletionRequest } from "@/lib/db/models";
import { randomToken } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { parseMetaSignedRequest } from "@/lib/platforms/connect/meta";

// Meta's data deletion callback: remove every Facebook/Instagram channel connected by this user.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const data = parseMetaSignedRequest(String(form?.get("signed_request") ?? ""));
  if (!data) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });

  await db();
  const { deletedCount } = await Channel.deleteMany({ platform: { $in: ["facebook", "instagram"] }, "meta.userId": data.user_id });
  const code = randomToken(12);
  await DeletionRequest.create({ code, platformUserId: data.user_id, channelsRemoved: deletedCount });
  return NextResponse.json({ url: `${appUrl()}/data-deletion?code=${code}`, confirmation_code: code });
}
