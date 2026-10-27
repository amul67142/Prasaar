// End-to-end check of R2 storage with the real bucket: signed upload, size lock, inspect,
// public URL, browser CORS preflight, delete. Uses a 1x1 PNG and cleans up after itself.
// Run: npm run r2:check   (reads .env.production.local)
import assert from "node:assert/strict";

const { R2Storage } = await import("@/lib/storage/r2");
const r2 = new R2Storage();
const origin = process.env.APP_URL || "https://prasaar.vercel.app";

// 1x1 transparent PNG.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==", "base64");
const key = `media/000000000000000000000000/r2check${Date.now().toString(36)}abcdef.png`;
const ok = (msg: string) => console.log(`✓ ${msg}`);

const target = await r2.createUpload(key, { mime: "image/png", maxBytes: png.length });

// A file of another size must be refused: the signature covers Content-Length.
const wrong = await fetch(target.url, { method: "PUT", headers: target.headers, body: Buffer.concat([png, Buffer.from("x")]) });
assert.equal(wrong.ok, false, `oversized upload was accepted (${wrong.status})`);
ok(`upload with a different size refused (${wrong.status})`);

const put = await fetch(target.url, { method: "PUT", headers: target.headers, body: png });
assert.ok(put.ok, `signed upload failed: ${put.status} ${await put.text()}`);
ok(`signed upload accepted (${put.status})`);

const info = await r2.inspect(key);
assert.ok(info, "object not found after upload");
assert.equal(info.sizeBytes, png.length);
assert.equal(info.width, 1);
assert.equal(info.height, 1);
ok(`inspect: ${info.sizeBytes} bytes, ${info.width}x${info.height}, ${info.checksum}`);

const pub = await fetch(r2.publicUrl(key));
assert.equal(pub.status, 200, `public URL returned ${pub.status}`);
assert.equal(Buffer.from(await pub.arrayBuffer()).equals(png), true, "public bytes differ from upload");
ok(`public URL serves the exact bytes (${pub.headers.get("content-type")})`);

// What the browser does before a cross-origin PUT. Fails until the bucket's CORS policy allows the app.
const pre = await fetch(target.url, {
  method: "OPTIONS",
  headers: { Origin: origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" },
});
const allowed = pre.headers.get("access-control-allow-origin");
if (pre.ok && (allowed === origin || allowed === "*")) ok(`CORS allows browser uploads from ${origin}`);
else console.log(`✗ CORS: browser uploads from ${origin} are NOT allowed yet (preflight ${pre.status}). Add the bucket CORS policy.`);

await r2.remove(key);
assert.equal(await r2.inspect(key), null, "object still there after delete");
ok("deleted, bucket left clean");
