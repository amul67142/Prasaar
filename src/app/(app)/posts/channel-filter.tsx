"use client";

import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Platform } from "@/lib/platforms/catalog";

export function ChannelFilter({
  channels,
  current,
  hrefFor,
}: {
  channels: { id: string; displayName: string; platform: Platform }[];
  current?: string;
  /** Pre-built links per channel id ("" = all), so this stays a dumb client component. */
  hrefFor: Record<string, string>;
}) {
  const selected = channels.find((c) => c.id === current);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="h-10 rounded-xl bg-background px-3.5 text-[15px] font-normal" />}>
        {selected ? <PlatformIcon platform={selected.platform} size="xs" /> : <span className="size-2 rounded-full bg-muted-foreground/50" />}
        <span className="max-w-40 truncate">{selected?.displayName ?? "All channels"}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem render={<Link href={hrefFor[""]} />}>
          <span className="flex-1">All channels</span>
          {!selected ? <Check className="size-4" /> : null}
        </DropdownMenuItem>
        {channels.length ? <DropdownMenuSeparator /> : null}
        {channels.map((c) => (
          <DropdownMenuItem key={c.id} render={<Link href={hrefFor[c.id]} />}>
            <PlatformIcon platform={c.platform} size="xs" />
            <span className="min-w-0 flex-1 truncate">{c.displayName}</span>
            {selected?.id === c.id ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
