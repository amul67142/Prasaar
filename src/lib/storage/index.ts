import "server-only";
import { createHmac } from "node:crypto";
import { appUrl, optionalEnv, requireEnv } from "../env";
import { safeEqual } from "../crypto";

export interface FileInfo {
  sizeBytes: number;
  sha256: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

/**
 * Where media lives. Hostinger today; an S3-compatible bucket (R2) later should only
 * need a new implementation of this interface and a config change.
 */
export interface Storage {
  createUpload(key: string, opts: { mime: string; maxBytes: number }): UploadTarget;
  publicUrl(key: string): string;
  inspect(key: string): Promise<FileInfo | null>;
  remove(key: string): Promise<void>;
}

// ----- signing, shared with upload-service/server.mjs (keep the two in sync) -----

function secret() {
  return requireEnv("UPLOAD_SIGNING_SECRET");
}

export function signUpload(key: string, mime: string, maxBytes: number, exp: number): string {
  return createHmac("sha256", secret()).update(`PUT\n${key}\n${mime}\n${maxBytes}\n${exp}`).digest("base64url");
}

export function verifyUpload(key: string, mime: string, maxBytes: number, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  return safeEqual(signUpload(key, mime, maxBytes, exp), sig);
}

function signAdmin(method: string, key: string, exp: number): string {
  return createHmac("sha256", secret()).update(`${method}\n${key}\n${exp}`).digest("base64url");
}

function uploadQuery(key: string, mime: string, maxBytes: number) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const params = new URLSearchParams({ mime, max: String(maxBytes), exp: String(exp), sig: signUpload(key, mime, maxBytes, exp) });
  return { exp, query: params.toString() };
}

// ----- Hostinger: a small Node upload service plus the CDN in front of the files -----

class HostingerStorage implements Storage {
  private uploadBase = requireEnv("UPLOAD_BASE_URL").replace(/\/$/, "");
  private cdnBase = requireEnv("CDN_BASE_URL").replace(/\/$/, "");

  createUpload(key: string, opts: { mime: string; maxBytes: number }): UploadTarget {
    const { exp, query } = uploadQuery(key, opts.mime, opts.maxBytes);
    return {
      url: `${this.uploadBase}/upload/${key}?${query}`,
      method: "PUT",
      headers: { "Content-Type": opts.mime },
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  publicUrl(key: string) {
    return `${this.cdnBase}/${key}`;
  }

  private adminHeaders(method: string, key: string) {
    const exp = Math.floor(Date.now() / 1000) + 300;
    return { "X-Expires": String(exp), "X-Signature": signAdmin(method, key, exp) };
  }

  async inspect(key: string) {
    const res = await fetch(`${this.uploadBase}/meta/${key}`, {
      headers: this.adminHeaders("META", key),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Upload service meta failed: ${res.status}`);
    return (await res.json()) as FileInfo;
  }

  async remove(key: string) {
    const res = await fetch(`${this.uploadBase}/files/${key}`, {
      method: "DELETE",
      headers: this.adminHeaders("DELETE", key),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok && res.status !== 404) throw new Error(`Upload service delete failed: ${res.status}`);
  }
}

// ----- Local disk, for development. Served by /api/dev-storage. -----

class LocalStorage implements Storage {
  createUpload(key: string, opts: { mime: string; maxBytes: number }): UploadTarget {
    const { exp, query } = uploadQuery(key, opts.mime, opts.maxBytes);
    return {
      url: `${appUrl()}/api/dev-storage/${key}?${query}`,
      method: "PUT",
      headers: { "Content-Type": opts.mime },
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  publicUrl(key: string) {
    return `${appUrl()}/api/dev-storage/${key}`;
  }

  async inspect(key: string) {
    const { inspectLocalFile } = await import("./local");
    return inspectLocalFile(key);
  }

  async remove(key: string) {
    const { removeLocalFile } = await import("./local");
    await removeLocalFile(key);
  }
}

let instance: Storage | null = null;

export function storage(): Storage {
  if (instance) return instance;
  const driver = optionalEnv("STORAGE_DRIVER") ?? (optionalEnv("UPLOAD_BASE_URL") ? "hostinger" : "local");
  instance = driver === "hostinger" ? new HostingerStorage() : new LocalStorage();
  return instance;
}

/** Keys look like media/<workspaceId>/<random>.<ext>. Reject anything else before touching disk. */
export const KEY_RE = /^media\/[a-f0-9]{24}\/[A-Za-z0-9_-]{16,64}\.[a-z0-9]{2,5}$/;
