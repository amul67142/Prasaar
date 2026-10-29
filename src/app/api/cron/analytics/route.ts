import { cronHandler } from "@/lib/cron";
import { collectAnalytics } from "@/lib/analytics";

export const maxDuration = 300;

// Daily: follower counts for every channel, and fresh numbers for posts from the last 30 days.
export const GET = cronHandler(() => collectAnalytics({ minAgeMs: 12 * 3_600_000, budgetMs: 240_000 }));
