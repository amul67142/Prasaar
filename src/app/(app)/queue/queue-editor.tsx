"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { ChannelAvatar } from "@/components/platform-icon";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Platform } from "@/lib/platforms/catalog";
import { cn } from "@/lib/utils";
import { copySlotsAction, saveSlotsAction } from "./actions";
import type { QueueOverview } from "./queue-data";

type Slot = { day: number; time: string };

// Shown Monday first; values are JS weekdays (0 = Sunday) as stored.
const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];
const WEEKDAYS = [1, 2, 3, 4, 5];

function fmt(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

const key = (s: Slot) => `${s.day}-${s.time}`;
const sortSlots = (list: Slot[]) =>
  [...new Map(list.map((s) => [key(s), s])).values()].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));

interface Props {
  channel: { id: string; platform: Platform; displayName: string; avatar?: string; status: string; slots: Slot[] };
  otherChannelIds: string[];
  overview: QueueOverview;
  canEdit: boolean;
}

export function QueueEditor({ channel, otherChannelIds, overview, canEdit }: Props) {
  const [slots, setSlots] = useState<Slot[]>(sortSlots(channel.slots));
  const [time, setTime] = useState("10:00");
  const [days, setDays] = useState<number[]>(WEEKDAYS);
  const [copyOpen, setCopyOpen] = useState(false);
  const [pending, start] = useTransition();

  // Reset to the saved slots when fresh server data arrives.
  const [savedSlots, setSavedSlots] = useState(channel.slots);
  if (channel.slots !== savedSlots) {
    setSavedSlots(channel.slots);
    setSlots(sortSlots(channel.slots));
  }

  const dirty = useMemo(() => sortSlots(channel.slots).map(key).join() !== slots.map(key).join(), [channel.slots, slots]);

  function add() {
    if (!/^\d{2}:\d{2}$/.test(time) || days.length === 0) return;
    setSlots((s) => sortSlots([...s, ...days.map((day) => ({ day, time }))]));
  }

  function save() {
    start(async () => {
      const res = await saveSlotsAction(channel.id, slots);
      if (res.ok) toast.success(`Saved posting times for ${channel.displayName}`);
      else toast.error(res.error.message);
    });
  }

  function copyToAll() {
    start(async () => {
      const res = await copySlotsAction([channel.id, ...otherChannelIds], slots);
      setCopyOpen(false);
      if (res.ok) toast.success(`Copied these times to ${otherChannelIds.length + 1} accounts`);
      else toast.error(res.error.message);
    });
  }

  return (
    <section className="rounded-xl border">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <ChannelAvatar platform={channel.platform} name={channel.displayName} avatar={channel.avatar} className="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{channel.displayName}</p>
          <p className="text-xs text-muted-foreground">
            {slots.length === 0 ? "No posting times yet" : `${slots.length} posting time${slots.length === 1 ? "" : "s"} a week`}
          </p>
        </div>
        {channel.status !== "active" ? <StatusBadge status={channel.status} /> : null}
        {canEdit ? (
          <div className="flex items-center gap-2">
            {otherChannelIds.length > 0 ? (
              <Button variant="outline" size="sm" disabled={pending || slots.length === 0} onClick={() => setCopyOpen(true)}>
                <Copy className="size-3.5" /> Copy to all accounts
              </Button>
            ) : null}
            <Button size="sm" disabled={pending || !dirty} onClick={save}>
              Save
            </Button>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 p-4 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-3">
          <div className="grid gap-1.5">
            {DAYS.map((d) => {
              const daySlots = slots.filter((s) => s.day === d.value);
              return (
                <div key={d.value} className="flex items-start gap-3">
                  <span className="w-9 shrink-0 pt-1 text-xs font-medium text-muted-foreground">{d.label}</span>
                  <div className="flex min-h-7 flex-1 flex-wrap gap-1.5">
                    {daySlots.length === 0 ? <span className="pt-1 text-xs text-muted-foreground/60">—</span> : null}
                    {daySlots.map((s) => (
                      <span key={key(s)} className="inline-flex h-7 items-center gap-1 rounded-md border bg-muted/40 pr-1 pl-2 text-xs tabular-nums">
                        {fmt(s.time)}
                        {canEdit ? (
                          <button
                            type="button"
                            aria-label={`Remove ${d.label} ${fmt(s.time)}`}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => setSlots((list) => list.filter((x) => key(x) !== key(s)))}
                          >
                            <X className="size-3" />
                          </button>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2.5">
              <input
                type="time"
                aria-label="Time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
              />
              <div className="flex flex-wrap gap-1" role="group" aria-label="Days">
                {DAYS.map((d) => {
                  const on = days.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDays((list) => (on ? list.filter((x) => x !== d.value) : [...list, d.value]))}
                      className={cn(
                        "h-8 rounded-md border px-2 text-xs",
                        on ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" onClick={add} disabled={days.length === 0}>
                <Plus className="size-3.5" /> Add time
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Next free times</h3>
            {overview.freeSlots.length === 0 ? (
              <p className="text-xs text-muted-foreground">{channel.slots.length === 0 ? "Add posting times to use the queue." : "No free times in the next 90 days."}</p>
            ) : (
              <ul className="space-y-1">
                {overview.freeSlots.map((s) => (
                  <li key={s.at} className="text-xs tabular-nums">
                    {s.label}
                  </li>
                ))}
              </ul>
            )}
            {dirty ? <p className="mt-1 text-xs text-amber-700">Save to update these.</p> : null}
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Scheduled in the next 7 days</h3>
            {overview.upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing scheduled.</p>
            ) : (
              <ul className="space-y-1.5">
                {overview.upcoming.map((p) => (
                  <li key={`${p.postGroupId}-${p.scheduledAt}`}>
                    <Link href={`/posts/${p.postGroupId}`} className="block rounded-md px-1.5 py-1 hover:bg-muted">
                      <span className="block text-xs tabular-nums text-muted-foreground">{p.label}</span>
                      <span className="block truncate text-xs">{p.snippet || "Media only"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy times to all accounts?</DialogTitle>
            <DialogDescription>
              The {slots.length} posting time{slots.length === 1 ? "" : "s"} shown for {channel.displayName} will replace the times of the other{" "}
              {otherChannelIds.length} account{otherChannelIds.length === 1 ? "" : "s"}. Posts already scheduled stay as they are.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>
              Cancel
            </Button>
            <Button onClick={copyToAll} disabled={pending}>
              Copy times
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
