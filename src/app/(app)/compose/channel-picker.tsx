"use client";

import { Check } from "lucide-react";
import { ChannelAvatar } from "@/components/platform-icon";
import { cn } from "@/lib/utils";
import type { ChannelView } from "@/lib/services/channels";

export function ChannelPicker({ channels, selected, onChange }: { channels: ChannelView[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  const active = channels.filter((c) => c.status === "active");
  const allOn = active.length > 0 && active.every((c) => selected.includes(c.id));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {channels.map((c) => {
        const on = selected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            title={c.status === "active" ? c.displayName : `${c.displayName}: needs reconnecting`}
            aria-pressed={on}
            className={cn(
              "relative flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition",
              on ? "border-foreground bg-foreground/[0.03]" : "opacity-60 hover:opacity-100",
              c.status !== "active" && "border-dashed border-destructive/50",
            )}
          >
            <ChannelAvatar platform={c.platform} name={c.displayName} avatar={c.avatar} className="size-7" />
            <span className="max-w-36 truncate">{c.displayName}</span>
            {on ? <Check className="size-3.5" /> : null}
          </button>
        );
      })}
      {active.length > 1 ? (
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => onChange(allOn ? [] : active.map((c) => c.id))}>
          {allOn ? "Clear" : "Select all"}
        </button>
      ) : null}
    </div>
  );
}
