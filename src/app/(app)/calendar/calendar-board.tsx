"use client";

import { useEffect, useRef, useState, useTransition, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ListFilter, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { STATUS_DOT, statusLabel } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Platform } from "@/lib/platforms/catalog";
import type { CalendarItem } from "@/lib/services/posts";
import { zonedToUtc } from "@/lib/time";
import { cn } from "@/lib/utils";
import { reschedulePostAction } from "./actions";
import { calendarHref, format12h, formatYmd, hourLabel, STATUS_FILTERS, type CalView } from "./range";

export type PlacedItem = CalendarItem & { localDate: string; localTime: string };

interface Props {
  view: CalView;
  date: string;
  today: string;
  /** Server render time, so links for "new post here" render the same on server and client. */
  nowMs: number;
  tz: string;
  days: string[];
  title: string;
  items: PlacedItem[];
  channels: { id: string; displayName: string; platform: Platform }[];
  filters: { channel?: string; status?: string };
  canReschedule: boolean;
  canCompose: boolean;
  hrefs: Record<"prev" | "next" | "today" | "month" | "week" | "day", string>;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DRAG_TYPE = "application/x-prasaar-post";
const MONTH_CELL_LIMIT = 3;
const pad = (n: number) => String(n).padStart(2, "0");
const byTime = (a: PlacedItem, b: PlacedItem) => a.localTime.localeCompare(b.localTime);

/** Only called from event handlers, never during render. */
const currentTime = () => Date.now();

export function CalendarBoard(props: Props) {
  const { view, date, today, nowMs, tz, days, items: initial, canReschedule, canCompose } = props;
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Take fresh server data when it arrives (after a refresh or navigation).
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setItems(initial);
  }

  const draggable = (i: PlacedItem) => canReschedule && (i.status === "scheduled" || i.status === "draft");

  /** Future time for a new post on this day/hour, or null when it's in the past. */
  function composeAt(day: string, hour?: number): string | null {
    const now = nowMs;
    let at = zonedToUtc(day, `${pad(hour ?? 9)}:00`, tz);
    if (hour === undefined && day === today && at.getTime() <= now) {
      at = new Date(Math.ceil((now + 60_000) / 3_600_000) * 3_600_000);
    }
    return at.getTime() > now ? at.toISOString() : null;
  }

  function onDrop(e: DragEvent, day: string, hour?: number) {
    e.preventDefault();
    setDropTarget(null);
    const id = e.dataTransfer.getData(DRAG_TYPE);
    const item = items.find((i) => i.id === id);
    if (!item || !draggable(item)) return;

    const time = hour === undefined ? item.localTime : `${pad(hour)}:${item.localTime.slice(3)}`;
    if (day === item.localDate && time === item.localTime) return;
    const at = zonedToUtc(day, time, tz);
    if (item.status === "scheduled" && at.getTime() < currentTime()) {
      toast.error("That time has already passed.");
      return;
    }

    const previous = items;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, localDate: day, localTime: time, scheduledAt: at.toISOString() } : i)));
    startTransition(async () => {
      const res = await reschedulePostAction(id, at.toISOString());
      if (!res.ok) {
        setItems(previous);
        toast.error(res.error.message);
      } else {
        toast.success(`Moved to ${formatYmd(day, { weekday: "short", day: "numeric", month: "short" })}, ${format12h(time)}`);
      }
    });
  }

  function dropProps(key: string, day: string, hour?: number) {
    if (!canReschedule) return {};
    return {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropTarget !== key) setDropTarget(key);
      },
      onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
      onDrop: (e: DragEvent) => onDrop(e, day, hour),
    };
  }

  const entry = (i: PlacedItem) => <Entry key={i.id} item={i} draggable={draggable(i)} />;

  return (
    <div>
      <PageHeader title="Calendar" description="Plan and move your posts" />

      <Toolbar {...props} onFilter={(next) => router.push(calendarHref({ view, date, ...props.filters, ...next }))} />

      {view === "month" ? (
        <>
          <div className="hidden overflow-hidden rounded-2xl border bg-background sm:block">
            <div className="grid grid-cols-7 border-b bg-muted/40">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-3 text-center text-sm font-medium text-foreground/80">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, idx) => {
                const inMonth = day.slice(0, 7) === date.slice(0, 7);
                const dayItems = items.filter((i) => i.localDate === day).sort(byTime);
                const at = canCompose ? composeAt(day) : null;
                const isToday = day === today;
                return (
                  <div
                    key={day}
                    {...dropProps(day, day)}
                    className={cn(
                      "group relative min-h-[130px] border-b p-2",
                      idx % 7 !== 6 && "border-r",
                      idx >= days.length - 7 && "border-b-0",
                      isToday && "bg-brand-soft/40",
                      dropTarget === day && "bg-brand-soft/70 ring-2 ring-brand/50 ring-inset",
                    )}
                  >
                    <div className="mb-1.5 flex items-start justify-between">
                      <span
                        className={cn(
                          "flex size-7 items-center justify-center rounded-full text-sm",
                          isToday ? "bg-brand font-semibold text-brand-foreground" : inMonth ? "text-foreground/80" : "text-muted-foreground/60",
                        )}
                      >
                        {Number(day.slice(8))}
                      </span>
                      {at ? (
                        <Link
                          href={`/compose?at=${encodeURIComponent(at)}`}
                          aria-label={`New post on ${formatYmd(day, { day: "numeric", month: "long" })}`}
                          className="flex size-5 items-center justify-center rounded-[5px] border border-brand/50 text-brand opacity-0 transition-opacity group-hover:opacity-100 hover:bg-brand-soft focus-visible:opacity-100"
                        >
                          <Plus className="size-3" />
                        </Link>
                      ) : null}
                    </div>
                    <div className="space-y-0.5">
                      {dayItems.slice(0, MONTH_CELL_LIMIT).map(entry)}
                      {dayItems.length > MONTH_CELL_LIMIT ? (
                        <Link
                          href={calendarHref({ view: "day", date: day, ...props.filters })}
                          className="block px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          +{dayItems.length - MONTH_CELL_LIMIT} more
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <Agenda days={days.filter((d) => d.slice(0, 7) === date.slice(0, 7))} items={items} today={today} entry={entry} />
        </>
      ) : (
        <TimeGrid days={days} today={today} items={items} entry={entry} dropProps={dropProps} dropTarget={dropTarget} composeAt={canCompose ? composeAt : null} />
      )}
    </div>
  );
}

function FilterButton({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuTrigger render={<Button variant="outline" className="h-10 rounded-xl bg-background px-3.5 text-[15px] font-normal" />}>
      {children}
      <ChevronDown className="size-4 text-muted-foreground" />
    </DropdownMenuTrigger>
  );
}

function Toolbar(props: Props & { onFilter: (next: { channel?: string; status?: string }) => void }) {
  const { view, title, hrefs, channels, filters, onFilter } = props;
  const channel = channels.find((c) => c.id === filters.channel);
  const status = STATUS_FILTERS.find((s) => s.value === filters.status);
  const navBtn = "h-10 rounded-xl bg-background";
  return (
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className={cn(navBtn, "w-10")} render={<Link href={hrefs.prev} aria-label="Previous" />}>
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className="min-w-40 text-center text-lg font-semibold tabular-nums">{title}</h2>
        <Button variant="outline" size="icon" className={cn(navBtn, "w-10")} render={<Link href={hrefs.next} aria-label="Next" />}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="outline" className={cn(navBtn, "ml-2 px-4 text-[15px]")} render={<Link href={hrefs.today} />}>
          Today
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <FilterButton>
            {channel ? <PlatformIcon platform={channel.platform} size="xs" /> : <span className="size-2 rounded-full bg-muted-foreground/50" />}
            <span className="max-w-36 truncate">{channel?.displayName ?? "All channels"}</span>
          </FilterButton>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onClick={() => onFilter({ channel: undefined })}>
              <span className="flex-1">All channels</span>
              {!channel ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
            {channels.length ? <DropdownMenuSeparator /> : null}
            {channels.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => onFilter({ channel: c.id })}>
                <PlatformIcon platform={c.platform} size="xs" />
                <span className="min-w-0 flex-1 truncate">{c.displayName}</span>
                {channel?.id === c.id ? <Check className="size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <FilterButton>
            <ListFilter className="size-4 text-muted-foreground" />
            {status?.label ?? "All posts"}
          </FilterButton>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onFilter({ status: undefined })}>
              <span className="flex-1">All posts</span>
              {!status ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {STATUS_FILTERS.map((s) => (
              <DropdownMenuItem key={s.value} onClick={() => onFilter({ status: s.value })}>
                <span className={cn("size-2 rounded-full", STATUS_DOT[s.value])} />
                <span className="flex-1">{s.label}</span>
                {status?.value === s.value ? <Check className="size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="inline-flex h-10 items-center rounded-xl border bg-background p-1">
          {(["week", "month"] as const).map((v) => (
            <Link
              key={v}
              href={hrefs[v]}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "flex h-full items-center rounded-lg px-3.5 text-[15px] capitalize transition-colors",
                view === v ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One post as a compact line: status dot, time, snippet. */
function Entry({ item, draggable }: { item: PlacedItem; draggable: boolean }) {
  return (
    <Link
      href={`/posts/${item.id}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      title={`${statusLabel(item.status)} · ${format12h(item.localTime)}${item.snippet ? ` · ${item.snippet}` : ""}`}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] hover:bg-muted/70",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[item.status] ?? "bg-muted-foreground")} />
      <span className="shrink-0 text-foreground/80 tabular-nums">{format12h(item.localTime)}</span>
      <span className="min-w-0 flex-1 truncate text-foreground/80">{item.snippet || "Media post"}</span>
    </Link>
  );
}

function Agenda({ days, items, today, entry }: { days: string[]; items: PlacedItem[]; today: string; entry: (i: PlacedItem) => ReactNode }) {
  const withItems = days.map((d) => ({ day: d, list: items.filter((i) => i.localDate === d).sort(byTime) })).filter((d) => d.list.length > 0);
  return (
    <div className="space-y-3 sm:hidden">
      {withItems.length === 0 ? (
        <p className="rounded-2xl border bg-background px-4 py-12 text-center text-sm text-muted-foreground">No posts this month.</p>
      ) : (
        withItems.map(({ day, list }) => (
          <section key={day} className="rounded-2xl border bg-background p-3">
            <h3 className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <span className={cn("flex size-7 items-center justify-center rounded-full", day === today && "bg-brand text-brand-foreground")}>
                {Number(day.slice(8))}
              </span>
              {formatYmd(day, { weekday: "long", month: "short" })}
            </h3>
            <div className="space-y-0.5">{list.map(entry)}</div>
          </section>
        ))
      )}
    </div>
  );
}

function TimeGrid({
  days,
  today,
  items,
  entry,
  dropProps,
  dropTarget,
  composeAt,
}: {
  days: string[];
  today: string;
  items: PlacedItem[];
  entry: (i: PlacedItem) => ReactNode;
  dropProps: (key: string, day: string, hour?: number) => object;
  dropTarget: string | null;
  composeAt: ((day: string, hour?: number) => string | null) | null;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const single = days.length === 1;

  useEffect(() => {
    const row = scroller.current?.querySelector<HTMLElement>('[data-hour="7"]');
    if (row && scroller.current) scroller.current.scrollTop = row.offsetTop;
  }, []);

  const cols = single ? "grid-cols-[4rem_1fr]" : "grid-cols-[4rem_repeat(7,minmax(7.5rem,1fr))]";

  return (
    <div className="overflow-hidden rounded-2xl border bg-background">
      <div className="overflow-x-auto">
        <div className={cn(!single && "min-w-[56rem]")}>
          <div className={cn("grid border-b bg-muted/40", cols)}>
            <div />
            {days.map((d) => (
              <div key={d} className="flex items-center justify-center gap-2 border-l py-2.5 text-sm">
                <span className="font-medium text-foreground/80">{formatYmd(d, { weekday: "short" })}</span>
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full",
                    d === today ? "bg-brand font-semibold text-brand-foreground" : "text-muted-foreground",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
              </div>
            ))}
          </div>
          <div ref={scroller} className="relative max-h-[70vh] overflow-y-auto">
            {HOURS.map((h) => (
              <div key={h} data-hour={h} className={cn("grid border-b last:border-b-0", cols)}>
                <div className="px-2 py-1.5 text-right text-xs text-muted-foreground tabular-nums">{hourLabel(h)}</div>
                {days.map((d) => {
                  const key = `${d}-${h}`;
                  const list = items.filter((i) => i.localDate === d && Number(i.localTime.slice(0, 2)) === h).sort(byTime);
                  const at = composeAt?.(d, h) ?? null;
                  return (
                    <div
                      key={key}
                      {...dropProps(key, d, h)}
                      onClick={(e) => {
                        if (at && e.target === e.currentTarget) router.push(`/compose?at=${encodeURIComponent(at)}`);
                      }}
                      className={cn(
                        "min-h-14 space-y-0.5 border-l p-1",
                        at && "cursor-pointer hover:bg-muted/40",
                        d === today && "bg-brand-soft/30",
                        dropTarget === key && "bg-brand-soft/70 ring-2 ring-brand/50 ring-inset",
                      )}
                    >
                      {list.map(entry)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
