// End-to-end check of the machine ingest routes: auth, media upload, post creation.
// Run: npm run ingest:smoke   (needs `npm run dev` running and a local MongoDB)
//
// Seeds a workspace and a YouTube channel, then drives the real HTTP routes
// exactly as the clip pipeline does. It has to share the database the dev
// server is reading, so it uses MONGODB_URI as given rather than its own.
import assert from "node:assert/strict";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const SECRET = process.env.INGEST_SECRET;
if (!SECRET) throw new Error("INGEST_SECRET must be set (use --env-file=.env.local)");

// This wipes the database before seeding, so refuse to run against anything
// that is not plainly a local one. A smoke test must never be one typo away
// from deleting the real workspace.
const uri = process.env.MONGODB_URI ?? "";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri)) {
  throw new Error(`Refusing to run: MONGODB_URI is not local (${uri.slice(0, 24)}...)`);
}

const { db } = await import("@/lib/db/mongo");
const mongoose = (await db()).connection;
await mongoose.dropDatabase();

const { createUserWithWorkspace } = await import("@/lib/services/accounts");
const { upsertChannels } = await import("@/lib/services/channels");

const user = await createUserWithWorkspace({
  email: "ingest@prasaar.test",
  name: "Ingest Smoke",
  password: "not-used-here",
  emailVerified: true,
});
const ctx = {
  userId: user._id,
  workspaceId: user.lastWorkspaceId!,
  role: "owner" as const,
  timezone: "Asia/Kolkata",
};
await upsertChannels(ctx, [
  {
    platform: "youtube" as const,
    externalId: "UCsmoketest",
    displayName: "Smoke Clips",
    credentials: { accessToken: "x", refreshToken: "y", expiresAt: Date.now() + 3.6e6 },
    meta: { username: "smokeclips" },
  },
]);

// INGEST_WORKSPACE_ID is deliberately not set: with one workspace present,
// serviceCtx must find it on its own. That fallback is what production relies
// on, so the test exercises it rather than routing around it.

const step = (name: string) => console.log(`✓ ${name}`);
const auth = { Authorization: `Bearer ${SECRET}` };

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...auth, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  return { status: res.status, body: (await res.json()) as { data?: never; error?: { code: string } } };
}

// 1. Auth is required, and a wrong secret is rejected the same way as none.
assert.equal((await fetch(`${BASE}/api/ingest/channels`)).status, 401);
assert.equal(
  (await fetch(`${BASE}/api/ingest/channels`, { headers: { Authorization: "Bearer wrong" } })).status,
  401,
);
step("ingest routes reject missing and wrong secrets");

// 2. Channels are listed, so a producer can check what it can post to.
const chans = await call("/api/ingest/channels");
assert.equal(chans.status, 200);
const list = chans.body.data as unknown as { platform: string; status: string }[];
assert.ok(list.some((c) => c.platform === "youtube" && c.status === "active"), "youtube channel listed");
step("channels listed");

// 3. A post with no media is refused before anything is created.
const noMedia = await call("/api/ingest/post", {
  method: "POST",
  body: JSON.stringify({ content: "x", platforms: ["youtube"], when: { mode: "draft" } }),
});
assert.equal(noMedia.status, 400);
assert.equal(noMedia.body.error?.code, "NO_MEDIA");
step("post without media rejected");

// 4. An unknown platform names itself in the error rather than failing opaquely.
const badPlatform = await call("/api/ingest/post", {
  method: "POST",
  body: JSON.stringify({ mediaIds: ["x"], platforms: ["myspace"], when: { mode: "draft" } }),
});
assert.equal(badPlatform.body.error?.code, "UNKNOWN_PLATFORM");
step("unknown platform rejected by name");

// 5. The real path: reserve, PUT the bytes, complete, then create the post.
const bytes = Buffer.alloc(64 * 1024, 7); // stands in for a rendered clip
const created = await call("/api/ingest/media", {
  method: "POST",
  body: JSON.stringify({ filename: "clip.mp4", mime: "video/mp4", sizeBytes: bytes.length, folder: "clips" }),
});
assert.equal(created.status, 200);
const { media, upload } = created.body.data as unknown as {
  media: { id: string; status: string };
  upload: { url: string; method: string; headers: Record<string, string> };
};
assert.equal(media.status, "uploading");

const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: new Uint8Array(bytes) });
assert.ok(put.ok, `upload PUT failed: ${put.status}`);

const done = await call(`/api/ingest/media/${media.id}`, { method: "POST" });
assert.equal(done.status, 200);
assert.equal((done.body.data as unknown as { status: string }).status, "ready");
step("media reserved, uploaded straight to storage, marked ready");

// 6. Creating the post returns a draft carrying the YouTube metadata.
const post = await call("/api/ingest/post", {
  method: "POST",
  body: JSON.stringify({
    content: "A clip description.\nvia Some Creator",
    mediaIds: [media.id],
    platforms: ["youtube"],
    when: { mode: "draft" },
    youtube: { title: "GTA 6 at 30fps: why the PS5 Pro can't do better", tags: ["gta 6", "gta 6 fps"] },
  }),
});
assert.equal(post.status, 200, JSON.stringify(post.body));
const group = post.body.data as unknown as { id: string; status: string };
assert.equal(group.status, "draft");
step("post created as a draft with YouTube metadata");

// 7. Defaulting to draft is deliberate: a runaway producer must not publish.
const defaulted = await call("/api/ingest/post", {
  method: "POST",
  body: JSON.stringify({ mediaIds: [media.id], platforms: ["youtube"] }),
});
assert.equal((defaulted.body.data as unknown as { status: string }).status, "draft");
step("omitting `when` defaults to draft, never to publishing");

console.log("\nall ingest checks passed");
await mongoose.close();
process.exit(0);
