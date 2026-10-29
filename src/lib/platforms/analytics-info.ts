// Client-safe: what each platform shares back about published posts, for the Analytics page.
import type { Platform } from "./catalog";

export const METRIC_KEYS = ["likes", "comments", "shares", "saves", "views", "reach"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRIC_LABELS: Record<MetricKey, string> = {
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
  views: "Views",
  reach: "Reach",
};

export const ANALYTICS_SUPPORT: Record<Platform, { metrics: MetricKey[]; followers: string | null; note?: string }> = {
  facebook: { metrics: ["likes", "comments", "shares"], followers: "Followers", note: "Likes are all reactions." },
  instagram: { metrics: ["likes", "comments", "shares", "saves", "views", "reach"], followers: "Followers", note: "Stories aren't counted." },
  linkedin: { metrics: [], followers: null, note: "LinkedIn shares stats only for company pages, which come with Company Page support." },
  youtube: { metrics: ["likes", "comments", "views"], followers: "Subscribers" },
  telegram: { metrics: [], followers: "Subscribers", note: "Telegram doesn't share view counts with bots." },
  bluesky: { metrics: ["likes", "comments", "shares"], followers: "Followers", note: "Shares are reposts and quotes." },
  mastodon: { metrics: ["likes", "comments", "shares"], followers: "Followers", note: "Shares are boosts." },
};

/** Likes + comments + shares + saves: the interactions every platform counts the same way. */
export function engagementOf(m: Partial<Record<MetricKey, number | null | undefined>> | undefined): number {
  if (!m) return 0;
  return (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
}
