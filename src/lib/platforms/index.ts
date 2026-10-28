import "server-only";
import type { Platform } from "./catalog";
import type { PlatformAdapter } from "./types";
import { facebookAdapter } from "./facebook";
import { instagramAdapter } from "./instagram";
import { linkedinAdapter } from "./linkedin";
import { telegramAdapter } from "./telegram";
import { blueskyAdapter } from "./bluesky";
import { mastodonAdapter } from "./mastodon";
import { youtubeAdapter } from "./youtube";

// Each adapter is typed with its own credential/meta shapes; the engine works with the generic form.
const ADAPTERS = {
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  linkedin: linkedinAdapter,
  telegram: telegramAdapter,
  bluesky: blueskyAdapter,
  mastodon: mastodonAdapter,
  youtube: youtubeAdapter,
} as unknown as Record<Platform, PlatformAdapter>;

export function getAdapter(platform: Platform): PlatformAdapter {
  const adapter = ADAPTERS[platform];
  if (!adapter) throw new Error(`No adapter for platform ${platform}`);
  return adapter;
}
