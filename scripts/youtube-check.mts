// Offline check of the YouTube adapter against a simulated YouTube: token refresh, resumable
// upload in chunks (with and without Range support on our storage), resume after a partial
// chunk, title rules, and error mapping. No network, no real channel.
// Run: npm run youtube:check
import assert from "node:assert/strict";

process.env.YOUTUBE_CLIENT_ID ??= "test-client";
process.env.YOUTUBE_CLIENT_SECRET ??= "test-secret";
const { youtubeAdapter } = await import("@/lib/platforms/youtube");
const { youtubeTitle, validatePost } = await import("@/lib/platforms/rules");

const ok = (msg: string) => console.log(`✓ ${msg}`);
const MB = 1024 * 1024;
const file = Buffer.alloc(70 * MB + 12345);
for (let i = 0; i < file.length; i++) file[i] = (i * 31 + 7) & 0xff;

interface Sim {
  rangeSupport: boolean;
  /** Accept only this many bytes of the first chunk, to exercise resume. */
  truncateFirstChunk?: number;
  initStatus?: number;
  initBody?: unknown;
}

function simulate(sim: Sim) {
  const received = Buffer.alloc(file.length);
  let receivedBytes = 0;
  let initBody: Record<string, unknown> | undefined;
  const ranges: string[] = [];
  let first = true;
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const headers = new Headers(init.headers);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "fresh-token", expires_in: 3599 });
    if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos")) {
      assert.equal(headers.get("authorization"), "Bearer fresh-token");
      assert.equal(headers.get("x-upload-content-length"), String(file.length));
      if (sim.initStatus) return Response.json(sim.initBody ?? {}, { status: sim.initStatus });
      initBody = JSON.parse(String(init.body));
      return new Response(null, { status: 200, headers: { Location: "https://upload.example/session/1" } });
    }
    if (url === "https://upload.example/session/1") {
      const range = headers.get("content-range")!;
      ranges.push(range);
      const [, start, , total] = range.match(/bytes (\d+)-(\d+)\/(\d+)/)!.map(Number);
      assert.equal(total, file.length);
      let chunk = Buffer.from(await (init.body as Blob).arrayBuffer());
      if (first && sim.truncateFirstChunk) chunk = chunk.subarray(0, sim.truncateFirstChunk);
      first = false;
      assert.equal(start, receivedBytes, "chunk must start where the last accepted one ended");
      chunk.copy(received, start);
      receivedBytes = start + chunk.length;
      if (receivedBytes === file.length) return Response.json({ id: "vid123" }, { status: 200 });
      return new Response(null, { status: 308, headers: { Range: `bytes=0-${receivedBytes - 1}` } });
    }
    if (url === "https://cdn.example/media/v.mp4") {
      const r = headers.get("range");
      if (sim.rangeSupport && r) {
        const [, s, e] = r.match(/bytes=(\d+)-(\d+)/)!.map(Number);
        return new Response(file.subarray(s, e + 1), { status: 206 });
      }
      return new Response(file, { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { received, ranges, initBody: () => initBody };
}

const channel = {
  id: "c1",
  platform: "youtube" as const,
  externalId: "UC1",
  displayName: "Test",
  credentials: { refreshToken: "r", accessToken: "stale", accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString() },
  meta: { channelId: "UC1" },
};
const media = [{ url: "https://cdn.example/media/v.mp4", mime: "video/mp4", kind: "video" as const, sizeBytes: file.length, filename: "launch.mp4" }];

for (const rangeSupport of [true, false]) {
  const s = simulate({ rangeSupport });
  const res = await youtubeAdapter.publish(channel, { text: "Launch day!\nMore below", media, format: "feed", privacy: "unlisted" });
  assert.equal(res.platformPostId, "vid123");
  assert.equal(res.permalink, "https://www.youtube.com/watch?v=vid123");
  assert.ok(s.received.equals(file), "YouTube received different bytes");
  assert.equal(s.ranges.length, 3);
  const body = s.initBody() as { snippet: { title: string; description: string }; status: { privacyStatus: string; selfDeclaredMadeForKids: boolean } };
  assert.equal(body.snippet.title, "Launch day!");
  assert.equal(body.status.privacyStatus, "unlisted");
  assert.equal(body.status.selfDeclaredMadeForKids, false);
  ok(`upload in ${s.ranges.length} chunks, bytes identical (${rangeSupport ? "ranged reads" : "host ignores Range"})`);
}

{
  const s = simulate({ rangeSupport: true, truncateFirstChunk: 5 * MB });
  const res = await youtubeAdapter.publish(channel, { text: "x", title: "My title", media, format: "reel" });
  assert.ok(s.received.equals(file));
  assert.equal(res.permalink, "https://www.youtube.com/shorts/vid123");
  assert.equal((s.initBody() as { snippet: { title: string } }).snippet.title, "My title");
  ok(`resumes from YouTube's Range after a partial chunk (${s.ranges.length} requests); Short permalink`);
}

{
  simulate({ rangeSupport: true, initStatus: 403, initBody: { error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } } });
  await assert.rejects(youtubeAdapter.publish(channel, { text: "x", media, format: "feed" }), (e: { code: string; temporary: boolean }) => e.code === "QUOTA_EXCEEDED" && !e.temporary);
  simulate({ rangeSupport: true, initStatus: 401 });
  await assert.rejects(youtubeAdapter.publish(channel, { text: "x", media, format: "feed" }), (e: { authFailed: boolean }) => e.authFailed);
  ok("quota and expired-token errors map to clear, non-retried failures");
}

assert.equal(youtubeTitle("", "\n  Hello <world>  \nrest"), "Hello world");
assert.equal(youtubeTitle(undefined, "", "clip.final.mp4"), "clip.final");
assert.equal(Array.from(youtubeTitle(undefined, "🎉".repeat(150))).length, 100);
const issues = validatePost({ platform: "youtube", text: "a <b>", media: [], format: "feed" }).map((i) => i.code);
assert.ok(issues.includes("VIDEO_REQUIRED") && issues.includes("YOUTUBE_ANGLE_BRACKETS"));
ok("title falls back to first line / filename, strips < >, caps at 100; video and < > rules");

console.log("\nAll YouTube checks passed.");
