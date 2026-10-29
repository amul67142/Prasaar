// Offline check of the YouTube adapter against a simulated YouTube: token refresh, resumable
// upload in chunks (with and without Range support on our storage), resume after a partial
// chunk, title rules, and error mapping. No network, no real channel.
// Run: npm run youtube:check
import assert from "node:assert/strict";

process.env.YOUTUBE_CLIENT_ID ??= "test-client";
process.env.YOUTUBE_CLIENT_SECRET ??= "test-secret";
const { youtubeAdapter } = await import("@/lib/platforms/youtube");
const { youtubeTitle, validatePost, parseYouTubeTags, youtubeTagsLength } = await import("@/lib/platforms/rules");

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
  thumbnailStatus?: number;
  /** Answer 404 this many times before accepting, like a video YouTube hasn't indexed yet. */
  playlistNotFoundTimes?: number;
}

function simulate(sim: Sim) {
  const received = Buffer.alloc(file.length);
  let receivedBytes = 0;
  let initBody: Record<string, unknown> | undefined;
  let initUrl = "";
  let thumb: { videoId: string; type: string; bytes: number } | undefined;
  const playlistAdds: { playlistId: string; videoId: string }[] = [];
  let playlistFailuresLeft = sim.playlistNotFoundTimes ?? 0;
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
      initUrl = url;
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
    if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/thumbnails/set")) {
      if (sim.thumbnailStatus) return Response.json({ error: { errors: [{ reason: "forbidden" }] } }, { status: sim.thumbnailStatus });
      const body = init.body as Blob;
      thumb = { videoId: new URL(url).searchParams.get("videoId")!, type: headers.get("content-type")!, bytes: body.size };
      return Response.json({ items: [] });
    }
    if (url === "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet") {
      if (playlistFailuresLeft-- > 0) return Response.json({ error: { errors: [{ reason: "videoNotFound" }] } }, { status: 404 });
      const b = JSON.parse(String(init.body)) as { snippet: { playlistId: string; resourceId: { videoId: string } } };
      playlistAdds.push({ playlistId: b.snippet.playlistId, videoId: b.snippet.resourceId.videoId });
      return Response.json({ id: "item1" });
    }
    if (url === "https://cdn.example/media/thumb.jpg") return new Response(Buffer.alloc(50_000), { status: 200 });
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
  return { received, ranges, initBody: () => initBody, initUrl: () => initUrl, thumb: () => thumb, playlistAdds };
}

const channel = {
  id: "c1",
  platform: "youtube" as const,
  externalId: "UC1",
  displayName: "Test",
  credentials: { refreshToken: "r", accessToken: "stale", accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString() },
  meta: { channelId: "UC1" },
};
const thumbnail = { url: "https://cdn.example/media/thumb.jpg", mime: "image/jpeg", kind: "image" as const, sizeBytes: 50_000, filename: "t.jpg" };
const media = [{ url: "https://cdn.example/media/v.mp4", mime: "video/mp4", kind: "video" as const, sizeBytes: file.length, filename: "launch.mp4" }];

for (const rangeSupport of [true, false]) {
  const s = simulate({ rangeSupport });
  const res = await youtubeAdapter.publish(channel, { text: "Launch day!\nMore below", media, format: "feed", youtube: { privacy: "unlisted" } });
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
  const res = await youtubeAdapter.publish(channel, { text: "x", youtube: { title: "My title" }, media, format: "reel", thumbnail });
  assert.ok(s.received.equals(file));
  assert.equal(res.permalink, "https://www.youtube.com/shorts/vid123");
  assert.equal((s.initBody() as { snippet: { title: string } }).snippet.title, "My title");
  assert.equal(s.thumb(), undefined, "Shorts must not get a thumbnail call");
  ok(`resumes from YouTube's Range after a partial chunk (${s.ranges.length} requests); Short permalink, no thumbnail call`);
}

{
  const s = simulate({ rangeSupport: true });
  const res = await youtubeAdapter.publish(channel, {
    text: "Demo",
    media,
    format: "feed",
    thumbnail,
    youtube: { tags: ["ai video", "ugc"], categoryId: "28", aiContent: true, paidPromotion: true, notifySubscribers: false, embeddable: false, madeForKids: true },
  });
  const body = s.initBody() as {
    snippet: { tags: string[]; categoryId: string };
    status: { containsSyntheticMedia?: boolean; embeddable: boolean; selfDeclaredMadeForKids: boolean };
    paidProductPlacementDetails?: { hasPaidProductPlacement: boolean };
  };
  const q = new URL(s.initUrl()).searchParams;
  assert.deepEqual(body.snippet.tags, ["ai video", "ugc"]);
  assert.equal(body.snippet.categoryId, "28");
  assert.equal(body.status.containsSyntheticMedia, true);
  assert.equal(body.status.embeddable, false);
  assert.equal(body.status.selfDeclaredMadeForKids, true);
  assert.equal(body.paidProductPlacementDetails?.hasPaidProductPlacement, true);
  assert.equal(q.get("part"), "snippet,status,paidProductPlacementDetails");
  assert.equal(q.get("notifySubscribers"), "false");
  assert.deepEqual(s.thumb(), { videoId: "vid123", type: "image/jpeg", bytes: 50_000 });
  assert.equal(res.warnings, undefined);
  ok("tags, category, AI disclosure, paid promotion, notify, embedding and made-for-kids reach YouTube; thumbnail set");

  const d = simulate({ rangeSupport: true });
  await youtubeAdapter.publish(channel, { text: "Plain", media, format: "feed" });
  const plain = d.initBody() as { snippet: Record<string, unknown>; status: Record<string, unknown> };
  assert.equal(plain.snippet.categoryId, "22");
  assert.equal("tags" in plain.snippet, false);
  assert.equal("containsSyntheticMedia" in plain.status, false);
  assert.equal(new URL(d.initUrl()).searchParams.get("part"), "snippet,status");
  ok("defaults: People & Blogs, no tags, no disclosures, subscribers notified");

  simulate({ rangeSupport: true, thumbnailStatus: 403 });
  const warned = await youtubeAdapter.publish(channel, { text: "x", media, format: "feed", thumbnail });
  assert.equal(warned.platformPostId, "vid123");
  assert.match(warned.warnings?.[0] ?? "", /phone-verified/);
  ok("a refused thumbnail leaves the video published with a clear warning");
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
assert.deepEqual(parseYouTubeTags(" a, #b ,A, <c>, "), ["a", "b", "c"]);
assert.equal(youtubeTagsLength(["a b", "cd"]), 8);
ok("tags: parsed, deduplicated, counted the way YouTube counts them");
ok("title falls back to first line / filename, strips < >, caps at 100; video and < > rules");

{
  const withScope = { ...channel, meta: { channelId: "UC1", scopes: ["https://www.googleapis.com/auth/youtube"] } };
  const pl = { playlistId: "PL123", playlistChannelId: "UC1" };
  let s = simulate({ rangeSupport: true, playlistNotFoundTimes: 1 });
  let res = await youtubeAdapter.publish(withScope, { text: "x", media, format: "feed", youtube: pl });
  assert.deepEqual(s.playlistAdds, [{ playlistId: "PL123", videoId: "vid123" }]);
  assert.equal(res.warnings, undefined);
  ok("adds the video to the chosen playlist, retrying while YouTube catches up");

  s = simulate({ rangeSupport: true });
  res = await youtubeAdapter.publish({ ...withScope, externalId: "UC-other" }, { text: "x", media, format: "feed", youtube: pl });
  assert.equal(s.playlistAdds.length, 0);
  assert.equal(res.warnings, undefined);
  s = simulate({ rangeSupport: true });
  res = await youtubeAdapter.publish(channel, { text: "x", media, format: "feed", youtube: pl });
  assert.equal(s.playlistAdds.length, 0);
  assert.match(res.warnings?.[0] ?? "", /Reconnect/);
  ok("skips another channel's playlist; asks to reconnect when playlist permission is missing");
}

console.log("\nAll YouTube checks passed.");
