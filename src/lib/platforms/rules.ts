// Platform posting rules. Client-safe: used by the composer for live checks and by
// the server before saving, so a bad post fails when written, not at send time.
import type { Platform } from "./catalog";

export type MediaKind = "image" | "video" | "document";
export type PostFormat = "feed" | "reel" | "story";

export interface PlatformRules {
  maxChars: number;
  /** Bluesky counts graphemes; everyone else counts UTF-16 characters. */
  countMode: "chars" | "graphemes";
  /** Lower limit for text when media is attached (Telegram captions). */
  maxCaptionChars?: number;
  maxHashtags?: number;
  requiresMedia: boolean;
  maxImages: number;
  maxVideos: number;
  maxDocuments: number;
  /** Max items in one post across all kinds. */
  maxItems: number;
  /** Images and videos in the same post. */
  allowMixed: boolean;
  mimes: Record<MediaKind, string[]>;
  maxBytes: Record<MediaKind, number>;
  firstComment: boolean;
  formats?: PostFormat[];
}

const MB = 1024 * 1024;
const IMAGE_COMMON = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const VIDEO_COMMON = ["video/mp4", "video/quicktime"];

export const PLATFORM_RULES: Record<Platform, PlatformRules> = {
  facebook: {
    maxChars: 63206,
    countMode: "chars",
    requiresMedia: false,
    maxImages: 10,
    maxVideos: 1,
    maxDocuments: 0,
    maxItems: 10,
    allowMixed: false,
    mimes: { image: IMAGE_COMMON, video: VIDEO_COMMON, document: [] },
    maxBytes: { image: 10 * MB, video: 1024 * MB, document: 0 },
    firstComment: true,
    formats: ["feed", "reel"],
  },
  instagram: {
    maxChars: 2200,
    countMode: "chars",
    maxHashtags: 30,
    requiresMedia: true,
    maxImages: 10,
    maxVideos: 10,
    maxDocuments: 0,
    maxItems: 10,
    allowMixed: true,
    mimes: { image: ["image/jpeg"], video: VIDEO_COMMON, document: [] },
    maxBytes: { image: 8 * MB, video: 300 * MB, document: 0 },
    firstComment: true,
    formats: ["feed", "reel", "story"],
  },
  linkedin: {
    maxChars: 3000,
    countMode: "chars",
    requiresMedia: false,
    maxImages: 20,
    maxVideos: 1,
    maxDocuments: 1,
    maxItems: 20,
    allowMixed: false,
    mimes: { image: ["image/jpeg", "image/png", "image/gif"], video: ["video/mp4"], document: ["application/pdf"] },
    maxBytes: { image: 8 * MB, video: 500 * MB, document: 100 * MB },
    firstComment: true,
  },
  telegram: {
    maxChars: 4096,
    maxCaptionChars: 1024,
    countMode: "chars",
    requiresMedia: false,
    maxImages: 10,
    maxVideos: 10,
    maxDocuments: 1,
    maxItems: 10,
    allowMixed: true,
    mimes: { image: IMAGE_COMMON.filter((m) => m !== "image/gif"), video: VIDEO_COMMON, document: ["application/pdf"] },
    maxBytes: { image: 10 * MB, video: 50 * MB, document: 50 * MB },
    firstComment: false,
  },
  bluesky: {
    maxChars: 300,
    countMode: "graphemes",
    requiresMedia: false,
    maxImages: 4,
    maxVideos: 0,
    maxDocuments: 0,
    maxItems: 4,
    allowMixed: false,
    mimes: { image: ["image/jpeg", "image/png", "image/webp"], video: [], document: [] },
    maxBytes: { image: 976 * 1024, video: 0, document: 0 },
    firstComment: false,
  },
  mastodon: {
    maxChars: 500,
    countMode: "chars",
    requiresMedia: false,
    maxImages: 4,
    maxVideos: 1,
    maxDocuments: 0,
    maxItems: 4,
    allowMixed: false,
    mimes: { image: IMAGE_COMMON, video: VIDEO_COMMON, document: [] },
    maxBytes: { image: 16 * MB, video: 99 * MB, document: 0 },
    firstComment: true,
  },
  // The post text becomes the video description; the title is a separate per-platform field.
  youtube: {
    maxChars: 5000,
    countMode: "chars",
    requiresMedia: true,
    maxImages: 0,
    maxVideos: 1,
    maxDocuments: 0,
    maxItems: 1,
    allowMixed: false,
    mimes: { image: [], video: VIDEO_COMMON, document: [] },
    maxBytes: { image: 0, video: 2048 * MB, document: 0 },
    firstComment: false,
    formats: ["feed", "reel"],
  },
};

/** Composer label for a post format; YouTube calls a reel a Short. */
export function formatLabel(platform: Platform, format: PostFormat): string {
  if (platform === "youtube") return format === "reel" ? "Short" : "Video";
  return format === "feed" ? "Feed post" : format === "reel" ? "Reel" : "Story";
}

export const YOUTUBE_TITLE_MAX = 100;
export type YouTubePrivacy = "public" | "unlisted" | "private";

/** YouTube's title: the one set in the composer, else the first line of the text. */
export function youtubeTitle(title: string | undefined, text: string, filename?: string): string {
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean);
  const raw = title?.trim() || firstLine || filename?.replace(/\.[^.]+$/, "") || "Untitled video";
  return Array.from(raw.replace(/[<>]/g, "")).slice(0, YOUTUBE_TITLE_MAX).join("");
}

/** YouTube's video categories (the set offered for India). 22 is YouTube's own default. */
export const YOUTUBE_CATEGORIES = [
  { id: "1", label: "Film & Animation" },
  { id: "2", label: "Autos & Vehicles" },
  { id: "10", label: "Music" },
  { id: "15", label: "Pets & Animals" },
  { id: "17", label: "Sports" },
  { id: "19", label: "Travel & Events" },
  { id: "20", label: "Gaming" },
  { id: "22", label: "People & Blogs" },
  { id: "23", label: "Comedy" },
  { id: "24", label: "Entertainment" },
  { id: "25", label: "News & Politics" },
  { id: "26", label: "Howto & Style" },
  { id: "27", label: "Education" },
  { id: "28", label: "Science & Technology" },
  { id: "29", label: "Nonprofits & Activism" },
] as const;
export type YouTubeCategoryId = (typeof YOUTUBE_CATEGORIES)[number]["id"];
export const YOUTUBE_CATEGORY_IDS = YOUTUBE_CATEGORIES.map((c) => c.id) as [YouTubeCategoryId, ...YouTubeCategoryId[]];

/** YouTube counts tags as one comma-separated string of at most 500 characters, quoting tags with spaces. */
export const YOUTUBE_TAGS_MAX = 500;
export function youtubeTagsLength(tags: string[]): number {
  return tags.reduce((n, t, i) => n + t.length + (/\s/.test(t) ? 2 : 0) + (i > 0 ? 1 : 0), 0);
}
/** "a, b ,#c" → ["a", "b", "c"], deduplicated. */
export function parseYouTubeTags(input: string): string[] {
  const seen = new Set<string>();
  return input
    .split(",")
    .map((t) => t.trim().replace(/^#/, "").replace(/[<>]/g, ""))
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
}

/** Adding to playlists needs YouTube's broader "manage" permission; channels connected before it was asked for lack it. */
export const YOUTUBE_MANAGE_SCOPE = "https://www.googleapis.com/auth/youtube";
export function youtubeCanUsePlaylists(meta: { scopes?: unknown }): boolean {
  return Array.isArray(meta.scopes) && meta.scopes.includes(YOUTUBE_MANAGE_SCOPE);
}

/** Custom thumbnails: JPEG or PNG up to 2 MB. Not settable on Shorts through the API. */
export const YOUTUBE_THUMBNAIL = { mimes: ["image/jpeg", "image/png"], maxBytes: 2 * MB } as const;

/** Everything YouTube-specific a post can carry, as the adapter receives it. */
export interface YouTubeOptions {
  title?: string;
  privacy?: YouTubePrivacy;
  madeForKids?: boolean;
  tags?: string[];
  categoryId?: YouTubeCategoryId;
  /** "Altered or synthetic content": realistic AI-made or edited footage. */
  aiContent?: boolean;
  paidPromotion?: boolean;
  notifySubscribers?: boolean;
  embeddable?: boolean;
  /** Added after upload, only on the channel the playlist belongs to. */
  playlistId?: string;
  playlistChannelId?: string;
}

export interface MediaInfo {
  kind: MediaKind;
  mime: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  filename?: string;
}

export interface Issue {
  severity: "error" | "warning";
  code: string;
  message: string;
  field?: string;
}

export function countText(text: string, mode: PlatformRules["countMode"]): number {
  if (mode === "graphemes" && typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter().segment(text)).length;
  }
  return text.length;
}

/** Effective character limit, given attached media and per-channel overrides (Mastodon servers vary). */
export function charLimit(platform: Platform, hasMedia: boolean, maxCharsOverride?: number): number {
  const rules = PLATFORM_RULES[platform];
  const base = maxCharsOverride ?? rules.maxChars;
  return hasMedia && rules.maxCaptionChars ? Math.min(base, rules.maxCaptionChars) : base;
}

const fmtMb = (bytes: number) => (bytes >= MB ? `${Math.round(bytes / MB)} MB` : `${Math.round(bytes / 1024)} KB`);

export function validatePost(input: {
  platform: Platform;
  text: string;
  media: MediaInfo[];
  format?: PostFormat;
  maxCharsOverride?: number;
}): Issue[] {
  const { platform, text, media } = input;
  const rules = PLATFORM_RULES[platform];
  const format = input.format ?? "feed";
  const issues: Issue[] = [];
  const err = (code: string, message: string, field?: string) => issues.push({ severity: "error", code, message, field });
  const warn = (code: string, message: string, field?: string) =>
    issues.push({ severity: "warning", code, message, field });

  const limit = charLimit(platform, media.length > 0, input.maxCharsOverride);
  const length = countText(text, rules.countMode);
  if (length > limit) err("TEXT_TOO_LONG", `Text is ${length} characters; the limit is ${limit}.`, "content");
  if (!text.trim() && media.length === 0) err("EMPTY_POST", "Add some text or media.", "content");

  if (rules.maxHashtags) {
    const tags = text.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
    if (tags > rules.maxHashtags) err("TOO_MANY_HASHTAGS", `Use at most ${rules.maxHashtags} hashtags (you have ${tags}).`, "content");
  }

  if (rules.formats && !rules.formats.includes(format)) err("FORMAT_UNSUPPORTED", `This platform can't post a ${format}.`);
  if (rules.requiresMedia && media.length === 0) err("MEDIA_REQUIRED", "This platform needs at least one image or video.", "mediaIds");

  const images = media.filter((m) => m.kind === "image").length;
  const videos = media.filter((m) => m.kind === "video").length;
  const docs = media.filter((m) => m.kind === "document").length;

  if (media.length > rules.maxItems) err("TOO_MANY_MEDIA", `At most ${rules.maxItems} files per post.`, "mediaIds");
  if (images > rules.maxImages) err("TOO_MANY_IMAGES", rules.maxImages === 0 ? "Images aren't supported." : `At most ${rules.maxImages} images.`, "mediaIds");
  if (videos > rules.maxVideos) err("TOO_MANY_VIDEOS", rules.maxVideos === 0 ? "Video isn't supported here yet." : `At most ${rules.maxVideos} video${rules.maxVideos > 1 ? "s" : ""}.`, "mediaIds");
  if (docs > rules.maxDocuments) err("DOCUMENTS_UNSUPPORTED", rules.maxDocuments === 0 ? "Documents aren't supported." : `At most ${rules.maxDocuments} document.`, "mediaIds");
  if (docs > 0 && images + videos > 0) err("MIXED_MEDIA", "A document can't be combined with images or video.", "mediaIds");
  if (!rules.allowMixed && images > 0 && videos > 0) err("MIXED_MEDIA", "Images and video can't be mixed in one post here.", "mediaIds");

  if (platform === "instagram") {
    if (format === "reel" && (videos !== 1 || images > 0)) err("REEL_NEEDS_ONE_VIDEO", "A reel needs exactly one video.", "mediaIds");
    if (format === "story" && media.length !== 1) err("STORY_NEEDS_ONE_FILE", "A story needs exactly one image or video.", "mediaIds");
  }
  if (platform === "facebook" && format === "reel" && (videos !== 1 || images > 0))
    err("REEL_NEEDS_ONE_VIDEO", "A reel needs exactly one video.", "mediaIds");
  if (platform === "youtube") {
    if (videos !== 1) err("VIDEO_REQUIRED", "YouTube needs exactly one video.", "mediaIds");
    if (/[<>]/.test(text)) err("YOUTUBE_ANGLE_BRACKETS", "YouTube doesn't allow < or > in the description.", "content");
    const v = media.find((m) => m.kind === "video");
    if (v && format === "reel") {
      if (v.durationSec && v.durationSec > 180) warn("SHORT_TOO_LONG", "Shorts can be up to 3 minutes; longer videos post as regular videos.", "mediaIds[0]");
      if (v.width && v.height && v.width > v.height) warn("SHORT_NOT_VERTICAL", "Shorts should be vertical or square; this video is landscape.", "mediaIds[0]");
    }
  }

  media.forEach((m, i) => {
    const field = `mediaIds[${i}]`;
    const allowed = rules.mimes[m.kind];
    if (allowed.length && !allowed.includes(m.mime)) {
      err("MEDIA_TYPE_UNSUPPORTED", `${m.filename ?? "File"}: ${m.mime} isn't accepted. Use ${allowed.map((x) => x.split("/")[1]).join(", ")}.`, field);
    }
    const max = rules.maxBytes[m.kind];
    if (max && m.sizeBytes > max) err("MEDIA_TOO_LARGE", `${m.filename ?? "File"} is ${fmtMb(m.sizeBytes)}; the limit is ${fmtMb(max)}.`, field);

    if (platform === "instagram" && m.kind === "image" && m.width && m.height && format === "feed") {
      const ratio = m.width / m.height;
      if (ratio < 0.8 || ratio > 1.91)
        err("ASPECT_RATIO", `${m.filename ?? "Image"}: Instagram feed images must be between 4:5 and 1.91:1.`, field);
    }
    if (platform === "instagram" && m.kind === "video" && m.durationSec && (format === "reel" ? m.durationSec > 900 : m.durationSec > 60) && format !== "story") {
      warn("VIDEO_LONG", `${m.filename ?? "Video"} may be too long for Instagram.`, field);
    }
  });

  return issues;
}
