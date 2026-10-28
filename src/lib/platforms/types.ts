import "server-only";
import type { Platform } from "./catalog";
import type { MediaKind, PostFormat, YouTubePrivacy } from "./rules";

/** A channel as an adapter sees it: credentials already decrypted. */
export interface AdapterChannel<Creds = Record<string, unknown>, Meta = Record<string, unknown>> {
  id: string;
  platform: Platform;
  externalId: string;
  displayName: string;
  credentials: Creds;
  meta: Meta;
}

export interface AdapterMedia {
  /** Public CDN URL. Meta fetches by URL; others we download and re-upload. */
  url: string;
  mime: string;
  kind: MediaKind;
  sizeBytes: number;
  filename: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface PublishInput {
  text: string;
  media: AdapterMedia[];
  format: PostFormat;
  firstComment?: string;
  /** YouTube only: video title, privacy and the made-for-kids declaration. */
  title?: string;
  privacy?: YouTubePrivacy;
  madeForKids?: boolean;
}

export interface PublishResult {
  platformPostId: string;
  permalink?: string;
  firstComment?: "posted" | "failed";
  raw?: unknown;
}

export interface RefreshResult<Creds = Record<string, unknown>> {
  credentials: Creds;
  tokenExpiresAt?: Date;
}

/** One adapter per platform, same shape for all. Validation lives in rules.ts and is shared with the browser. */
export interface PlatformAdapter<Creds = Record<string, unknown>, Meta = Record<string, unknown>> {
  platform: Platform;
  publish(channel: AdapterChannel<Creds, Meta>, input: PublishInput): Promise<PublishResult>;
  /** Cheap call that proves the stored credentials still work. */
  check(channel: AdapterChannel<Creds, Meta>): Promise<void>;
  /** Present for platforms whose tokens expire and can be refreshed. */
  refresh?(channel: AdapterChannel<Creds, Meta>): Promise<RefreshResult<Creds>>;
}

/**
 * Thrown by adapters. `temporary` errors (rate limits, timeouts, 5xx) are retried by the
 * engine; permanent ones (revoked token, rejected media) fail the post at once.
 */
export class PlatformError extends Error {
  constructor(
    public code: string,
    message: string,
    public temporary = false,
    public raw?: unknown,
    /** The channel's credentials are no longer valid; mark it for reconnect. */
    public authFailed = false,
  ) {
    super(message);
    this.name = "PlatformError";
  }
}

/** A candidate account found during connect, before the user chooses to add it. */
export interface ConnectCandidate {
  platform: Platform;
  externalId: string;
  displayName: string;
  username?: string;
  avatar?: string;
  credentials: Record<string, unknown>;
  meta: Record<string, unknown>;
  tokenExpiresAt?: string;
  /** Why it can't be added, e.g. "No Instagram Business account linked". */
  unavailableReason?: string;
}
