import { cronHandler } from "@/lib/cron";
import { sweep } from "@/lib/engine";

export const maxDuration = 300;

export const GET = cronHandler(sweep);
