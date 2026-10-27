import { NextResponse, type NextRequest } from "next/server";
import { publishPost } from "@/lib/engine";
import { verifyQueueSignature } from "@/lib/queue";

export const maxDuration = 300;

// Called by QStash for each due post.
export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!(await verifyQueueSignature(req.headers.get("upstash-signature"), body))) {
    return NextResponse.json({ error: { code: "BAD_SIGNATURE", message: "Invalid signature" } }, { status: 401 });
  }
  let postId: unknown;
  try {
    postId = (JSON.parse(body) as { postId?: unknown }).postId;
  } catch {}
  if (typeof postId !== "string") return NextResponse.json({ error: { code: "BAD_REQUEST", message: "postId required" } }, { status: 400 });

  // Failures are recorded on the post and retried by our own schedule, so answer 200
  // unless something unexpected happens (QStash then redelivers; the lock prevents doubles).
  const result = await publishPost(postId);
  return NextResponse.json({ result });
}
