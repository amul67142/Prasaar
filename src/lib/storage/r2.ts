import "server-only";
import { AwsClient } from "aws4fetch";
import { requireEnv } from "../env";
import { imageDimensions } from "./dims";
import type { FileInfo, Storage, UploadTarget } from "./index";

const MB = 1024 * 1024;
const UPLOAD_TTL_SEC = 3600;

/**
 * Cloudflare R2: browsers PUT straight into the bucket with a pre-signed URL, and files are
 * served from the bucket's public domain. One service for both, no server of our own.
 */
export class R2Storage implements Storage {
  private client = new AwsClient({
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    service: "s3",
    region: "auto",
  });
  private endpoint = `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${requireEnv("R2_BUCKET")}`;
  private publicBase = requireEnv("R2_PUBLIC_BASE_URL").replace(/\/$/, "");

  private objectUrl(key: string) {
    return `${this.endpoint}/${key}`;
  }

  async createUpload(key: string, opts: { mime: string; maxBytes: number }): Promise<UploadTarget> {
    const url = new URL(this.objectUrl(key));
    url.searchParams.set("X-Amz-Expires", String(UPLOAD_TTL_SEC));
    // Signing Content-Type and Content-Length means R2 rejects any other type or size.
    const signed = await this.client.sign(url.toString(), {
      method: "PUT",
      headers: { "Content-Type": opts.mime, "Content-Length": String(opts.maxBytes) },
      aws: { signQuery: true, allHeaders: true },
    });
    return {
      url: signed.url,
      method: "PUT",
      headers: { "Content-Type": opts.mime },
      expiresAt: new Date(Date.now() + UPLOAD_TTL_SEC * 1000).toISOString(),
    };
  }

  publicUrl(key: string) {
    return `${this.publicBase}/${key}`;
  }

  async inspect(key: string): Promise<FileInfo | null> {
    const head = await this.client.fetch(this.objectUrl(key), { method: "HEAD", signal: AbortSignal.timeout(15_000) });
    if (head.status === 404) return null;
    if (!head.ok) throw new Error(`R2 HEAD failed: ${head.status}`);
    const sizeBytes = Number(head.headers.get("content-length") ?? 0);
    const info: FileInfo = { sizeBytes, checksum: `etag:${(head.headers.get("etag") ?? "").replaceAll('"', "")}` };

    if ((head.headers.get("content-type") ?? "").startsWith("image/")) {
      // Dimensions live in the first bytes for most images; fall back to the whole file for small ones.
      let dims = imageDimensions(await this.read(key, 256 * 1024));
      if (!dims && sizeBytes <= 20 * MB) dims = imageDimensions(await this.read(key));
      Object.assign(info, dims);
    }
    return info;
  }

  private async read(key: string, bytes?: number): Promise<Uint8Array> {
    const res = await this.client.fetch(this.objectUrl(key), {
      headers: bytes ? { Range: `bytes=0-${bytes - 1}` } : {},
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`R2 GET failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async remove(key: string) {
    const res = await this.client.fetch(this.objectUrl(key), { method: "DELETE", signal: AbortSignal.timeout(15_000) });
    if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE failed: ${res.status}`);
  }
}
