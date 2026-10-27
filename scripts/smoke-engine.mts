// End-to-end check of the publishing engine against a fake Mastodon server.
// Run: npm run smoke   (needs `npm run db:dev` running; uses a separate prasaar_smoke database)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

process.env.MONGODB_URI = (process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/prasaar").replace(/\/[^/]*$/, "/prasaar_smoke");

const statuses: Record<string, unknown>[] = [];
let failNextRetry = true;
const fake = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const json = (code: number, data: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (token === "bad") return json(401, { error: "The access token is invalid" });
    if (req.url === "/api/v1/statuses" && req.method === "POST") {
      const parsed = JSON.parse(body) as { status: string };
      if (parsed.status.startsWith("RETRY") && failNextRetry) {
        failNextRetry = false;
        return json(503, { error: "busy" });
      }
      statuses.push(parsed);
      const id = String(1000 + statuses.length);
      return json(200, { id, url: `https://fake.social/@test/${id}`, uri: id });
    }
    json(404, { error: "not found" });
  });
});
await new Promise<void>((r) => fake.listen(0, "127.0.0.1", r));
const instance = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;

const { db } = await import("@/lib/db/mongo");
const mongoose = (await db()).connection;
await mongoose.dropDatabase();
const { Post, PostGroup, Channel } = await import("@/lib/db/models");
const { createUserWithWorkspace } = await import("@/lib/services/accounts");
const { upsertChannels, updateSlots } = await import("@/lib/services/channels");
const { savePostGroup } = await import("@/lib/services/posts");
const { publishPost, sweep } = await import("@/lib/engine");

const user = await createUserWithWorkspace({ email: "smoke@prasaar.test", name: "Smoke Test", password: "not-used-here", emailVerified: true });
const ctx = { userId: user._id, workspaceId: user.lastWorkspaceId!, role: "owner" as const, timezone: "Asia/Kolkata" };
const candidate = (id: string, token: string) => ({
  platform: "mastodon" as const,
  externalId: `${id}@fake`,
  displayName: `Mastodon ${id}`,
  credentials: { accessToken: token },
  meta: { instance, accountId: id, username: id, maxChars: 500 },
});
const [good, bad] = await upsertChannels(ctx, [candidate("good", "ok"), candidate("bad", "bad")]);
const step = (name: string) => console.log(`✓ ${name}`);

// 1. Publish now to two channels: one works (with first comment), one has a dead token.
const g1 = await savePostGroup(ctx, { content: "Hello from Prasaar", channelIds: [good.id, bad.id], firstComment: "First!", when: { mode: "now" } });
await sweep();
const p1 = await Post.find({ postGroupId: g1.id }).lean();
const ok = p1.find((p) => p.channelId.toString() === good.id)!;
const dead = p1.find((p) => p.channelId.toString() === bad.id)!;
assert.equal(ok.status, "published");
assert.equal(ok.permalink, "https://fake.social/@test/1001");
assert.equal(ok.firstCommentStatus, "posted");
assert.equal(statuses[1].in_reply_to_id, "1001");
assert.equal(dead.status, "failed");
assert.equal((await Channel.findById(bad.id).lean())!.status, "expired");
assert.equal((await PostGroup.findById(g1.id).lean())!.status, "partially_published");
step("publish now: success, first comment, auth failure marks channel expired, group partially published");

// 2. Temporary error retries with backoff, then succeeds.
const g2 = await savePostGroup(ctx, { content: "RETRY me", channelIds: [good.id], when: { mode: "now" } });
await sweep();
let p2 = (await Post.findOne({ postGroupId: g2.id }).lean())!;
assert.equal(p2.status, "retrying");
assert.ok(p2.nextAttemptAt! > new Date());
await Post.updateOne({ _id: p2._id }, { nextAttemptAt: new Date(Date.now() - 1000) });
await sweep();
p2 = (await Post.findOne({ postGroupId: g2.id }).lean())!;
assert.equal(p2.status, "published");
assert.equal(p2.attempts, 2);
step("temporary 503 → retrying → published on next attempt");

// 3. Two copies of the same job publish once.
const before = statuses.length;
const g3 = await savePostGroup(ctx, { content: "Only once", channelIds: [good.id], when: { mode: "now" } });
const p3 = (await Post.findOne({ postGroupId: g3.id }).lean())!;
const results = await Promise.all([publishPost(p3._id.toString()), publishPost(p3._id.toString())]);
assert.deepEqual(results.sort(), ["published", "skipped"]);
assert.equal(statuses.length, before + 1);
step("duplicate jobs: exactly one publish");

// 4. Validation happens at save time.
await assert.rejects(savePostGroup(ctx, { content: "x".repeat(501), channelIds: [good.id], when: { mode: "now" } }), { code: "VALIDATION_FAILED" });
await assert.rejects(
  savePostGroup(ctx, { content: "late", channelIds: [good.id], when: { mode: "schedule", scheduledAt: new Date(Date.now() - 3_600_000).toISOString() } }),
  { code: "SCHEDULED_TIME_IN_PAST" },
);
await assert.rejects(savePostGroup(ctx, { content: "to dead", channelIds: [bad.id], when: { mode: "now" } }), { code: "CHANNEL_NOT_ACTIVE" });
step("rejects too-long text, past time, and expired channel before saving");

// 5. Future schedule is not published early; rescheduling to now publishes.
const at = new Date(Date.now() + 3_600_000).toISOString();
const g5 = await savePostGroup(ctx, { content: "Later", channelIds: [good.id], when: { mode: "schedule", scheduledAt: at } });
await sweep();
assert.equal((await Post.findOne({ postGroupId: g5.id }).lean())!.status, "scheduled");
step("future post stays scheduled");

// 6. Queue picks the next free slot, skipping a taken one.
await updateSlots(ctx, good.id, [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, time: "09:00" })));
const q1 = await savePostGroup(ctx, { content: "Queued 1", channelIds: [good.id], when: { mode: "queue" } });
const q2 = await savePostGroup(ctx, { content: "Queued 2", channelIds: [good.id], when: { mode: "queue" } });
const t1 = new Date(q1.scheduledAt!);
const t2 = new Date(q2.scheduledAt!);
assert.equal(t1.toISOString().slice(11, 16), "03:30"); // 09:00 IST
assert.equal(t2.getTime() - t1.getTime(), 86_400_000);
step("queue: 09:00 IST slots, second post takes the next day");

// 7. Drafts don't publish; editing a scheduled post re-plans it.
const d = await savePostGroup(ctx, { content: "Draft", channelIds: [good.id], when: { mode: "draft" } });
assert.equal(d.status, "draft");
assert.equal(await Post.countDocuments({ postGroupId: d.id }), 0);
const edited = await savePostGroup(ctx, { content: "Later, edited", channelIds: [good.id], when: { mode: "now" } }, { id: g5.id });
assert.equal(edited.posts.length, 1);
await sweep();
assert.equal((await Post.findOne({ postGroupId: g5.id }).lean())!.status, "published");
assert.equal(statuses.at(-1)!.status, "Later, edited");
step("drafts create no deliveries; editing a scheduled post replaces its delivery");

console.log("\nAll engine checks passed.");
await mongoose.dropDatabase();
await mongoose.close();
fake.close();
