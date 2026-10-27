import { cronHandler } from "@/lib/cron";
import { cleanupMedia } from "@/lib/maintenance";

export const maxDuration = 300;

export const GET = cronHandler(cleanupMedia);
