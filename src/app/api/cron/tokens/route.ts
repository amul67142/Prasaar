import { cronHandler } from "@/lib/cron";
import { refreshExpiringTokens } from "@/lib/maintenance";

export const maxDuration = 300;

export const GET = cronHandler(refreshExpiringTokens);
