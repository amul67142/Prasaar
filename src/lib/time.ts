// Timezone helpers. Times are stored in UTC and shown in the workspace timezone.
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const DEFAULT_TZ = "Asia/Kolkata";

export function formatInTz(date: Date | string, tz: string, pattern: string): string {
  return formatInTimeZone(typeof date === "string" ? new Date(date) : date, tz, pattern);
}

/** "2026-10-24" + "09:30" in tz → UTC Date. */
export function zonedToUtc(dateStr: string, timeStr: string, tz: string): Date {
  return fromZonedTime(`${dateStr}T${timeStr}:00`, tz);
}

/** Wall-clock parts of a UTC instant in tz. */
export function zonedParts(date: Date, tz: string) {
  const z = toZonedTime(date, tz);
  return { year: z.getFullYear(), month: z.getMonth(), day: z.getDate(), weekday: z.getDay(), hours: z.getHours(), minutes: z.getMinutes() };
}

export function ymd(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "yyyy-MM-dd");
}

/** Add whole days to a yyyy-MM-dd string (calendar arithmetic, no timezone involved). */
export function addDaysYmd(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function weekdayOfYmd(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Kathmandu",
  "Asia/Dhaka",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];
