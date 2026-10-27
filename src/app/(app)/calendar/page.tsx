import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/page-header";
import type { GroupStatus } from "@/lib/db/models";
import { can } from "@/lib/permissions";
import { requireCtx } from "@/lib/session";
import { listChannels } from "@/lib/services/channels";
import { listCalendar } from "@/lib/services/posts";
import { addDaysYmd, formatInTz, ymd, zonedToUtc } from "@/lib/time";
import { CalendarBoard, type PlacedItem } from "./calendar-board";
import { calendarHref, parseView, rangeDays, rangeTitle, shiftDate, STATUS_FILTERS, validYmd } from "./range";

export const metadata: Metadata = { title: "Calendar" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CalendarContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CalendarContent({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const tz = ctx.timezone;
  const now = new Date();
  const today = ymd(now, tz);

  const view = parseView(one(sp.view));
  const date = validYmd(one(sp.date)) ?? today;
  const channel = one(sp.channel) || undefined;
  const statusRaw = one(sp.status);
  const status = STATUS_FILTERS.some((s) => s.value === statusRaw) ? (statusRaw as GroupStatus) : undefined;

  const days = rangeDays(view, date);
  const from = zonedToUtc(days[0], "00:00", tz);
  const to = zonedToUtc(addDaysYmd(days[days.length - 1], 1), "00:00", tz);

  const [items, channels] = await Promise.all([listCalendar(ctx, { from, to, channelId: channel, status }), listChannels(ctx)]);
  const placed: PlacedItem[] = items.map((i) => ({
    ...i,
    localDate: formatInTz(i.scheduledAt, tz, "yyyy-MM-dd"),
    localTime: formatInTz(i.scheduledAt, tz, "HH:mm"),
  }));

  const base = { view, date, channel, status };
  return (
    <CalendarBoard
      view={view}
      date={date}
      today={today}
      nowMs={now.getTime()}
      tz={tz}
      days={days}
      title={rangeTitle(view, date, days)}
      items={placed}
      channels={channels.map((c) => ({ id: c.id, displayName: c.displayName, platform: c.platform }))}
      filters={{ channel, status }}
      canReschedule={can(ctx.role, "post:publish")}
      canCompose={can(ctx.role, "post:write")}
      hrefs={{
        prev: calendarHref({ ...base, date: shiftDate(view, date, -1) }),
        next: calendarHref({ ...base, date: shiftDate(view, date, 1) }),
        today: calendarHref({ ...base, date: today }),
        month: calendarHref({ ...base, view: "month" }),
        week: calendarHref({ ...base, view: "week" }),
        day: calendarHref({ ...base, view: "day" }),
      }}
    />
  );
}
