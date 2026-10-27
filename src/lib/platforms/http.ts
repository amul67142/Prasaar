import "server-only";
import { PlatformError } from "./types";

const TIMEOUT_MS = 30_000;

/**
 * fetch with a timeout and error classification shared by adapters.
 * `describe` turns the platform's error body into a plain-language message.
 */
export async function platformFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  describe?: (status: number, body: unknown) => { code?: string; message?: string; authFailed?: boolean; temporary?: boolean } | undefined,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new PlatformError(timedOut ? "TIMEOUT" : "NETWORK_ERROR", timedOut ? "The platform took too long to answer." : "Couldn't reach the platform.", true, String(err));
  }
  if (res.ok) return res;

  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {}
  const d = describe?.(res.status, body) ?? {};
  const temporary = d.temporary ?? (res.status === 429 || res.status >= 500);
  const authFailed = d.authFailed ?? res.status === 401;
  throw new PlatformError(
    d.code ?? (res.status === 429 ? "RATE_LIMITED" : authFailed ? "TOKEN_INVALID" : `HTTP_${res.status}`),
    d.message ?? (res.status === 429 ? "The platform is rate limiting us; we'll retry." : authFailed ? "The connection to this account has expired. Reconnect it." : `The platform rejected the post (HTTP ${res.status}).`),
    temporary,
    body,
    authFailed,
  );
}

export async function fetchJson<T>(...args: Parameters<typeof platformFetch>): Promise<T> {
  const res = await platformFetch(...args);
  return (await res.json()) as T;
}

/** Download a media file from our CDN so it can be re-uploaded to a platform. */
export async function downloadMedia(url: string, maxBytes: number): Promise<Blob> {
  const res = await platformFetch(url, { timeoutMs: 120_000 });
  const blob = await res.blob();
  if (blob.size > maxBytes) throw new PlatformError("MEDIA_TOO_LARGE", "The file is larger than this platform allows.");
  return blob;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
