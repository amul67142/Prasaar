import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { KEY_RE, storageDriver, verifyUpload } from "@/lib/storage";
import { readLocalFile, writeLocalFile } from "@/lib/storage/local";

// Local stand-in for the Hostinger upload service + CDN. Disabled unless the local driver is in use.
const enabled = () => storageDriver() === "local";

type Params = { params: Promise<{ key: string[] }> };

export async function PUT(req: NextRequest, { params }: Params) {
  if (!enabled()) return new NextResponse(null, { status: 404 });
  const key = (await params).key.join("/");
  const q = req.nextUrl.searchParams;
  const mime = q.get("mime") ?? "";
  const max = Number(q.get("max"));
  const exp = Number(q.get("exp"));
  if (!KEY_RE.test(key) || !verifyUpload(key, mime, max, exp, q.get("sig") ?? "")) {
    return NextResponse.json({ error: { code: "UPLOAD_URL_INVALID", message: "Upload link is invalid or expired." } }, { status: 403 });
  }
  if ((req.headers.get("content-type") ?? "").split(";")[0] !== mime) {
    return NextResponse.json({ error: { code: "MIME_MISMATCH", message: "File type doesn't match." } }, { status: 400 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > max) {
    return NextResponse.json({ error: { code: "MEDIA_TOO_LARGE", message: "File is too large." } }, { status: 413 });
  }
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length > max) {
    return NextResponse.json({ error: { code: "MEDIA_TOO_LARGE", message: "File is too large." } }, { status: 413 });
  }
  await writeLocalFile(key, bytes, mime);
  return NextResponse.json({ ok: true, sizeBytes: bytes.length });
}

export async function GET(_req: NextRequest, { params }: Params) {
  if (!enabled()) return new NextResponse(null, { status: 404 });
  const key = (await params).key.join("/");
  if (!KEY_RE.test(key)) return new NextResponse(null, { status: 404 });
  try {
    const file = await readLocalFile(key);
    return new NextResponse(Readable.toWeb(file.stream) as ReadableStream, {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(file.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
