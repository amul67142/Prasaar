import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { optionalEnv } from "./env";

type Window = `${number} ${"s" | "m" | "h"}`;

const limiters = new Map<string, Ratelimit>();
const memory = new Map<string, { count: number; resetAt: number }>();

function windowMs(window: Window): number {
  const [n, unit] = window.split(" ") as [string, "s" | "m" | "h"];
  return Number(n) * { s: 1000, m: 60_000, h: 3_600_000 }[unit];
}

/**
 * Sliding-window limit. Uses Upstash Redis when configured; otherwise an in-process
 * counter, which is fine for local development but not shared across instances.
 */
export async function rateLimit(
  bucket: string,
  id: string,
  limit: number,
  window: Window,
): Promise<{ ok: boolean; remaining: number; resetAt: number }> {
  const url = optionalEnv("UPSTASH_REDIS_REST_URL");
  const token = optionalEnv("UPSTASH_REDIS_REST_TOKEN");
  if (url && token) {
    const key = `${bucket}:${limit}:${window}`;
    let limiter = limiters.get(key);
    if (!limiter) {
      limiter = new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(limit, window),
        prefix: `rl:${bucket}`,
      });
      limiters.set(key, limiter);
    }
    const res = await limiter.limit(id);
    return { ok: res.success, remaining: res.remaining, resetAt: res.reset };
  }

  const key = `${bucket}:${id}`;
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs(window) });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs(window) };
  }
  entry.count++;
  return { ok: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
}
