// Date-range helpers for the calendar. Client-safe; works on yyyy-MM-dd strings
// that are already in the workspace timezone, so no timezone math happens here.
import { addDaysYmd, weekdayOfYmd } from "@/lib/time";

export type CalView = "month" | "week" | "day";

export const STATUS_FILTERS = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "publishing", label: "Publishing" },
  { value: "published", label: "Published" },
  { value: "partially_published", label: "Partly published" },
  { value: "failed", label: "Failed" },
] as const;

export function parseView(v: string | undefined): CalView {
  return v === "week" || v === "day" ? v : "month";
}

export function validYmd(v: string | undefined): string | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? v : undefined;
}

/** Weeks start on Sunday. */
export function weekStartYmd(d: string): string {
  return addDaysYmd(d, -weekdayOfYmd(d));
}

function monthStartYmd(d: string): string {
  return `${d.slice(0, 8)}01`;
}

function addMonthsYmd(d: string, n: number): string {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

export function rangeDays(view: CalView, date: string): string[] {
  if (view === "day") return [date];
  if (view === "week") {
    const start = weekStartYmd(date);
    return Array.from({ length: 7 }, (_, i) => addDaysYmd(start, i));
  }
  const first = monthStartYmd(date);
  const last = addDaysYmd(addMonthsYmd(first, 1), -1);
  const start = weekStartYmd(first);
  const end = addDaysYmd(weekStartYmd(last), 6);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDaysYmd(d, 1)) days.push(d);
  return days;
}

export function shiftDate(view: CalView, date: string, dir: 1 | -1): string {
  if (view === "month") return addMonthsYmd(monthStartYmd(date), dir);
  return addDaysYmd(date, view === "week" ? 7 * dir : dir);
}

/** A yyyy-MM-dd as a Date at UTC noon, for formatting with timeZone "UTC". */
export function ymdDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12));
}

export function formatYmd(d: string, opts: Intl.DateTimeFormatOptions): string {
  return ymdDate(d).toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
}

export function rangeTitle(view: CalView, date: string, days: string[]): string {
  if (view === "month") return formatYmd(date, { month: "long", year: "numeric" });
  if (view === "day") return formatYmd(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const a = days[0];
  const b = days[days.length - 1];
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return `${formatYmd(a, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" })} – ${formatYmd(b, { day: "numeric", month: "short", year: "numeric" })}`;
}

export interface CalParams {
  view: CalView;
  date: string;
  channel?: string;
  status?: string;
}

export function calendarHref(p: CalParams): string {
  const q = new URLSearchParams({ view: p.view, date: p.date });
  if (p.channel) q.set("channel", p.channel);
  if (p.status) q.set("status", p.status);
  return `/calendar?${q.toString()}`;
}

/** "14:05" → "2:05 PM". */
export function format12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function hourLabel(h: number): string {
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}
