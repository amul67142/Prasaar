// Offline check of analytics: each platform's stats calls against simulated APIs, then the
// collector and the Analytics page data against a scratch database.
// Run: npm run analytics:check   (needs `npm run db:dev` running; uses a separate prasaar_analytics database)
import assert from "node:assert/strict";

process.env.MONGODB_URI = (process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/prasaar").replace(/\/[^/]*$/, "/prasaar_analytics");
process.env.YOUTUBE_CLIENT_ID ??= "test-client";
process.env.YOUTUBE_CLIENT_SECRET ??= "test-secret";

const ok = (msg: string) => console.log(`✓ ${msg}`);
type Handler = (url: URL, init: RequestInit) => Response | undefined;
let handler: Handler = () => undefined;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = new URL(String(input));
  const res = handler(url, init);
  if (!res) throw new Error(`unexpected fetch ${url}`);
  return res;
}) as typeof fetch;
const json = (data: unknown, status = 200) => Response.json(data, { status });

const { getAdapter } = await import("@/lib/platforms");
const ch = <C, M>(platform: string, credentials: C, meta: M) => ({ id: "c1", platform, externalId: "ext", displayName: "Test", credentials, meta }) as never;

// ---------- Instagram: basic counts + insights; falls back when the insights permission is missing ----------
{
  let insightsAllowed = true;
  const calls: string[] = [];
  handler = (url) => {
    calls.push(url.pathname);
    if (url.pathname.endsWith("/m1") || url.pathname.endsWith("/m2")) return json({ like_count: 10, comments_count: 3 });
    if (url.pathname.endsWith("/insights")) {
      if (!insightsAllowed) return json({ error: { code: 10, message: "Application does not have permission" } }, 400);
      assert.equal(url.searchParams.get("metric"), "reach,saved,shares,views");
      return json({ data: [{ name: "reach", values: [{ value: 400 }] }, { name: "saved", values: [{ value: 7 }] }, { name: "shares", values: [{ value: 2 }] }, { name: "views", total_value: { value: 900 } }] });
    }
    if (url.pathname.endsWith("/me")) return json({ followers_count: 1234 });
  };
  const ig = getAdapter("instagram");
  const channel = ch("instagram", { accessToken: "t" }, { igUserId: "ig1", userId: "u" });
  let r = await ig.metrics!(channel, [
    { id: "p1", platformPostId: "m1", format: "feed" },
    { id: "p2", platformPostId: "m2", format: "story" },
  ]);
  assert.deepEqual(r.posts.p1, { likes: 10, comments: 3, reach: 400, saves: 7, shares: 2, views: 900 });
  assert.deepEqual(r.posts.p2, { likes: 10, comments: 3 });
  assert.equal(calls.filter((c) => c.endsWith("/insights")).length, 1, "stories must not ask for insights");
  assert.equal(r.note, undefined);
  assert.equal(await ig.followers!(channel), 1234);

  insightsAllowed = false;
  calls.length = 0;
  r = await ig.metrics!(channel, [
    { id: "p1", platformPostId: "m1", format: "feed" },
    { id: "p3", platformPostId: "m2", format: "reel" },
  ]);
  assert.deepEqual(r.posts.p1, { likes: 10, comments: 3 });
  assert.deepEqual(r.posts.p3, { likes: 10, comments: 3 });
  assert.equal(calls.filter((c) => c.endsWith("/insights")).length, 1, "stop asking once the permission is known to be missing");
  assert.match(r.note ?? "", /Reconnect/);
  ok("Instagram: likes, comments, reach, saves, shares, views; stories skip insights; missing permission keeps basic counts and says reconnect");
}

// ---------- Facebook: reactions for posts, likes for reels ----------
{
  handler = (url) => {
    const fields = url.searchParams.get("fields") ?? "";
    if (url.pathname.endsWith("/post1")) {
      assert.match(fields, /reactions\.summary/);
      return json({ reactions: { summary: { total_count: 25 } }, comments: { summary: { total_count: 4 } }, shares: { count: 6 } });
    }
    if (url.pathname.endsWith("/post2")) return json({ reactions: { summary: { total_count: 1 } }, comments: { summary: { total_count: 0 } } });
    if (url.pathname.endsWith("/reel1")) {
      assert.match(fields, /^likes\.summary/);
      return json({ likes: { summary: { total_count: 50 } }, comments: { summary: { total_count: 5 } } });
    }
    if (url.pathname.endsWith("/page1")) return json({ followers_count: 999, fan_count: 900 });
  };
  const fb = getAdapter("facebook");
  const channel = ch("facebook", { pageAccessToken: "t" }, { pageId: "page1", userId: "u" });
  const r = await fb.metrics!(channel, [
    { id: "a", platformPostId: "post1", format: "feed" },
    { id: "b", platformPostId: "post2", format: "feed" },
    { id: "c", platformPostId: "reel1", format: "reel" },
  ]);
  assert.deepEqual(r.posts.a, { likes: 25, comments: 4, shares: 6 });
  assert.deepEqual(r.posts.b, { likes: 1, comments: 0, shares: 0 });
  assert.deepEqual(r.posts.c, { likes: 50, comments: 5, shares: undefined });
  assert.equal(await fb.followers!(channel), 999);
  ok("Facebook: reactions, comments and shares for posts; likes and comments for reels; followers");
}

// ---------- YouTube: batched statistics, hidden subscriber counts ----------
{
  let hidden = false;
  const batches: number[] = [];
  handler = (url) => {
    if (url.hostname === "oauth2.googleapis.com") return json({ access_token: "a", expires_in: 3600 });
    if (url.pathname.endsWith("/videos")) {
      const ids = url.searchParams.get("id")!.split(",");
      batches.push(ids.length);
      return json({ items: ids.filter((i) => i !== "gone").map((id) => ({ id, statistics: { viewCount: "100", likeCount: "9", commentCount: "2" } })) });
    }
    if (url.pathname.endsWith("/channels")) return json({ items: [{ statistics: hidden ? { hiddenSubscriberCount: true } : { subscriberCount: "321" } }] });
  };
  const yt = getAdapter("youtube");
  const channel = ch("youtube", { refreshToken: "r" }, { channelId: "UC" });
  const posts = Array.from({ length: 55 }, (_, i) => ({ id: `p${i}`, platformPostId: i === 54 ? "gone" : `v${i}`, format: "feed" as const }));
  const r = await yt.metrics!(channel, posts);
  assert.deepEqual(batches, [50, 5]);
  assert.deepEqual(r.posts.p0, { views: 100, likes: 9, comments: 2 });
  assert.equal(r.posts.p54, undefined, "a deleted video is left out, not zeroed");
  assert.equal(await yt.followers!(channel), 321);
  hidden = true;
  await assert.rejects(yt.followers!(channel), /hides its subscriber count/);
  ok("YouTube: views, likes, comments in batches of 50; deleted videos skipped; hidden subscriber counts reported");
}

// ---------- Bluesky (public API), Mastodon, Telegram ----------
{
  handler = (url) => {
    if (url.pathname === "/xrpc/app.bsky.feed.getPosts") {
      return json({ posts: url.searchParams.getAll("uris").map((uri) => ({ uri, likeCount: 5, replyCount: 1, repostCount: 2, quoteCount: 1 })) });
    }
    if (url.pathname === "/xrpc/app.bsky.actor.getProfile") return json({ followersCount: 77 });
    if (url.pathname === "/api/v1/statuses/s1") return json({ favourites_count: 8, reblogs_count: 3, replies_count: 1 });
    if (url.pathname === "/api/v1/statuses/s2") return json({ error: "Record not found" }, 404);
    if (url.pathname === "/api/v1/accounts/verify_credentials") return json({ followers_count: 42 });
    if (url.pathname.endsWith("/getChatMemberCount")) return json({ ok: true, result: 151 });
  };
  const bs = getAdapter("bluesky");
  const bsCh = ch("bluesky", { identifier: "x", appPassword: "y" }, { did: "did:plc:1", handle: "x", service: "https://bsky.social" });
  const r = await bs.metrics!(bsCh, Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, platformPostId: `at://did:plc:1/app.bsky.feed.post/${i}`, format: "feed" as const })));
  assert.deepEqual(r.posts.b0, { likes: 5, comments: 1, shares: 3 });
  assert.equal(Object.keys(r.posts).length, 30);
  assert.equal(await bs.followers!(bsCh), 77);

  const ma = getAdapter("mastodon");
  const maCh = ch("mastodon", { accessToken: "t" }, { instance: "https://m.example", accountId: "1", username: "u", maxChars: 500 });
  const mr = await ma.metrics!(maCh, [
    { id: "s1", platformPostId: "s1", format: "feed" },
    { id: "s2", platformPostId: "s2", format: "feed" },
  ]);
  assert.deepEqual(mr.posts, { s1: { likes: 8, comments: 1, shares: 3 } });
  assert.equal(await ma.followers!(maCh), 42);

  const tgA = getAdapter("telegram");
  assert.equal(tgA.metrics, undefined);
  assert.equal(await tgA.followers!(ch("telegram", { botToken: "1:x" }, { chatId: "@c", chatTitle: "c", chatType: "channel" })), 150);
  assert.equal(getAdapter("linkedin").metrics, undefined);
  ok("Bluesky (reposts + quotes as shares), Mastodon (deleted posts skipped), Telegram subscribers minus the bot, LinkedIn none");
}

// ---------- Collector + Analytics page data, on a scratch database ----------
globalThis.fetch = realFetch;
const { db } = await import("@/lib/db/mongo");
const conn = (await db()).connection;
await conn.dropDatabase();
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = new URL(String(input));
  const res = handler(url, init);
  if (!res) throw new Error(`unexpected fetch ${url}`);
  return res;
}) as typeof fetch;

const { Post, PostGroup, Channel, ChannelStat } = await import("@/lib/db/models");
const { createUserWithWorkspace } = await import("@/lib/services/accounts");
const { upsertChannels } = await import("@/lib/services/channels");
const { collectAnalytics } = await import("@/lib/analytics");
const { getAnalytics, refreshAnalytics } = await import("@/lib/services/analytics");

const user = await createUserWithWorkspace({ email: "stats@prasaar.test", name: "Stats", password: "not-used-here", emailVerified: true });
const ctx = { userId: user._id, workspaceId: user.lastWorkspaceId!, role: "owner" as const, timezone: "Asia/Kolkata" };
const [bsky, masto] = await upsertChannels(ctx, [
  { platform: "bluesky", externalId: "did:plc:1", displayName: "Bluesky", credentials: { identifier: "x", appPassword: "aaaa-bbbb-cccc-dddd" }, meta: { did: "did:plc:1", handle: "x", service: "https://bsky.social" } },
  { platform: "mastodon", externalId: "1@m", displayName: "Mastodon", credentials: { accessToken: "dead" }, meta: { instance: "https://m.example", accountId: "1", username: "u", maxChars: 500 } },
]);

const likesByUri: Record<string, number> = { "at://did:plc:1/app.bsky.feed.post/a": 50, "at://did:plc:1/app.bsky.feed.post/b": 5 };
handler = (url) => {
  if (url.pathname === "/xrpc/app.bsky.feed.getPosts") {
    return json({ posts: url.searchParams.getAll("uris").filter((u) => u in likesByUri).map((uri) => ({ uri, likeCount: likesByUri[uri], replyCount: 1, repostCount: 0, quoteCount: 0 })) });
  }
  if (url.pathname === "/xrpc/app.bsky.actor.getProfile") return json({ followersCount: 120 });
  if (url.hostname === "m.example") return json({ error: "The access token is invalid" }, 401);
};

const DAY = 86_400_000;
const mkPost = async (channelId: string, platform: "bluesky" | "mastodon", content: string, uri: string, daysAgo: number) => {
  const g = await PostGroup.create({ workspaceId: ctx.workspaceId, content, channelIds: [channelId], status: "published", createdBy: ctx.userId });
  return Post.create({
    postGroupId: g._id,
    workspaceId: ctx.workspaceId,
    channelId,
    platform,
    status: "published",
    platformPostId: uri,
    publishedAt: new Date(Date.now() - daysAgo * DAY),
  });
};
await mkPost(bsky.id, "bluesky", "Big launch post", "at://did:plc:1/app.bsky.feed.post/a", 2);
await mkPost(bsky.id, "bluesky", "Small update", "at://did:plc:1/app.bsky.feed.post/b", 5);
await mkPost(bsky.id, "bluesky", "Deleted on Bluesky", "at://did:plc:1/app.bsky.feed.post/gone", 6);
await mkPost(bsky.id, "bluesky", "Too old to track", "at://did:plc:1/app.bsky.feed.post/old", 45);
await mkPost(masto.id, "mastodon", "Toot", "s1", 3);

let res = await collectAnalytics({ workspaceId: ctx.workspaceId, minAgeMs: 0, budgetMs: 60_000 });
assert.equal(res.channels, 2);
assert.equal(res.posts, 2, "two Bluesky posts have numbers");
assert.equal(res.errors, 1, "the Mastodon token is dead");
const a = await Post.findOne({ platformPostId: "at://did:plc:1/app.bsky.feed.post/a" }).lean();
assert.equal(a?.metrics?.likes, 50);
const gone = await Post.findOne({ platformPostId: "at://did:plc:1/app.bsky.feed.post/gone" }).lean();
assert.ok(gone?.metricsAt && gone.metrics?.likes == null, "posts the platform no longer returns get a timestamp but no numbers");
const old = await Post.findOne({ platformPostId: "at://did:plc:1/app.bsky.feed.post/old" }).lean();
assert.equal(old?.metricsAt, undefined, "posts older than 30 days aren't read");
assert.equal((await Channel.findById(bsky.id).lean())?.followers, 120);
assert.match((await Channel.findById(masto.id).lean())?.analyticsNote ?? "", /Reconnect/);
ok("collector: saves numbers and today's follower count, skips old posts, notes channels that need reconnecting");

res = await collectAnalytics({ workspaceId: ctx.workspaceId, minAgeMs: 3_600_000, budgetMs: 60_000 });
assert.equal(res.posts, 0, "fresh numbers aren't re-read");
ok("collector: doesn't re-read numbers fresher than the minimum age");

// Follower history: 100 nine days ago, 120 today.
const nineDaysAgo = new Date(Date.now() - 9 * DAY).toISOString().slice(0, 10);
await ChannelStat.create({ workspaceId: ctx.workspaceId, channelId: bsky.id, day: nineDaysAgo, followers: 100 });
const view = await getAnalytics(ctx, 30);
assert.equal(view.totals.posts, 4, "posts published in the last 30 days");
assert.equal(view.totals.likes, 55);
assert.equal(view.totals.engagement, 57);
assert.equal(view.followersNow, 120);
assert.equal(view.followersChange, 20);
assert.deepEqual(view.followers.map((f) => f.value), [100, 120]);
assert.equal(view.topPosts[0].snippet, "Big launch post");
assert.equal(view.topPosts[0].engagement, 51);
assert.equal(view.channels.find((c) => c.platform === "bluesky")?.followers, 120);
const week = await getAnalytics(ctx, 7);
assert.equal(week.totals.posts, 4);
assert.equal(week.previous.posts, 0);
ok("page data: totals, engagement, follower trend and change, top posts ranked");

await refreshAnalytics(ctx);
await assert.rejects(refreshAnalytics(ctx), /last 10 minutes/);
ok("Refresh stats: runs once, then waits 10 minutes");

await conn.dropDatabase();
await conn.close();
console.log("\nAll analytics checks passed.");
