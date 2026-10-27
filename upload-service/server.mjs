// Prasaar upload service. Runs as a Node.js app on Hostinger.
// Browsers PUT files here with a signed URL from the Next.js app; files land under
// MEDIA_ROOT (served as-is by the CDN) and metadata under META_ROOT (not public).
// The signing scheme must match src/lib/storage/index.ts.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { imageSize } from "image-size";

class TooLarge extends Error {}

const PORT = Number(process.env.PORT ?? 3001);
const SECRET = process.env.UPLOAD_SIGNING_SECRET;
const MEDIA_ROOT = process.env.MEDIA_ROOT;
const META_ROOT = process.env.META_ROOT;
const APP_ORIGIN = (process.env.APP_ORIGIN ?? "").replace(/\/$/, "");
if (!SECRET || !MEDIA_ROOT || !META_ROOT || !APP_ORIGIN) {
  console.error("Set UPLOAD_SIGNING_SECRET, MEDIA_ROOT, META_ROOT and APP_ORIGIN");
  process.exit(1);
}

const KEY_RE = /^media\/[a-f0-9]{24}\/[A-Za-z0-9_-]{16,64}\.[a-z0-9]{2,5}$/;
const sign = (payload) => createHmac("sha256", SECRET).update(payload).digest("base64url");
const safeEqual = (a, b) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};
const filePath = (key) => path.join(MEDIA_ROOT, ...key.split("/"));
const metaPath = (key) => path.join(META_ROOT, ...key.split("/")) + ".json";

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": APP_ORIGIN, Vary: "Origin" });
  res.end(JSON.stringify(body));
}

const fail = (res, status, code, message) => send(res, status, { error: { code, message } });

function adminOk(req, method, key) {
  const exp = Number(req.headers["x-expires"]);
  const sig = String(req.headers["x-signature"] ?? "");
  return Number.isFinite(exp) && exp > Date.now() / 1000 && safeEqual(sign(`${method}\n${key}\n${exp}`), sig);
}

function videoDuration(file) {
  return new Promise((resolve) => {
    execFile("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { timeout: 20_000 }, (err, out) => {
      const sec = Number(String(out).trim());
      resolve(err || !Number.isFinite(sec) ? undefined : Math.round(sec * 10) / 10);
    });
  });
}

async function handleUpload(req, res, key, url) {
  const mime = url.searchParams.get("mime") ?? "";
  const max = Number(url.searchParams.get("max"));
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!Number.isFinite(exp) || exp < Date.now() / 1000 || !safeEqual(sign(`PUT\n${key}\n${mime}\n${max}\n${exp}`), sig)) {
    return fail(res, 403, "UPLOAD_URL_INVALID", "Upload link is invalid or expired.");
  }
  if ((req.headers["content-type"] ?? "").split(";")[0] !== mime) return fail(res, 400, "MIME_MISMATCH", "File type doesn't match.");
  if (Number(req.headers["content-length"] ?? 0) > max) return fail(res, 413, "MEDIA_TOO_LARGE", "File is too large.");

  const final = filePath(key);
  const temp = `${final}.part`;
  await mkdir(path.dirname(final), { recursive: true });
  const hash = createHash("sha256");
  let size = 0;
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > max) return cb(new TooLarge());
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  try {
    await pipeline(req, meter, createWriteStream(temp, { flags: "wx" }));
  } catch (err) {
    await rm(temp, { force: true });
    if (err instanceof TooLarge) return fail(res, 413, "MEDIA_TOO_LARGE", "File is too large.");
    throw err;
  }
  await rename(temp, final);

  const meta = { mime, sizeBytes: size, sha256: hash.digest("hex") };
  if (mime.startsWith("image/")) {
    try {
      const dims = imageSize(await readFile(final));
      const rotated = (dims.orientation ?? 1) >= 5;
      meta.width = rotated ? dims.height : dims.width;
      meta.height = rotated ? dims.width : dims.height;
    } catch {}
  } else if (mime.startsWith("video/")) {
    meta.durationSec = await videoDuration(final);
  }
  await mkdir(path.dirname(metaPath(key)), { recursive: true });
  await writeFile(metaPath(key), JSON.stringify(meta));
  send(res, 200, { ok: true, sizeBytes: size });
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const [, route, ...rest] = url.pathname.split("/");
    const key = decodeURIComponent(rest.join("/"));

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": APP_ORIGIN,
        "Access-Control-Allow-Methods": "PUT",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      });
      return res.end();
    }
    if (route === "health") return send(res, 200, { ok: true });
    if (!KEY_RE.test(key)) return fail(res, 404, "NOT_FOUND", "Not found");

    if (route === "upload" && req.method === "PUT") return await handleUpload(req, res, key, url);
    if (route === "meta" && req.method === "GET") {
      if (!adminOk(req, "META", key)) return fail(res, 403, "FORBIDDEN", "Bad signature");
      try {
        return send(res, 200, JSON.parse(await readFile(metaPath(key), "utf8")));
      } catch {
        return fail(res, 404, "NOT_FOUND", "Not found");
      }
    }
    if (route === "files" && req.method === "DELETE") {
      if (!adminOk(req, "DELETE", key)) return fail(res, 403, "FORBIDDEN", "Bad signature");
      await rm(filePath(key), { force: true });
      await rm(metaPath(key), { force: true });
      return send(res, 200, { ok: true });
    }
    fail(res, 404, "NOT_FOUND", "Not found");
  } catch (err) {
    console.error(err);
    if (!res.headersSent) fail(res, 500, "INTERNAL", "Upload failed");
  }
}).listen(PORT, () => console.log(`upload service on :${PORT}`));
