"use client";

import { useState } from "react";
import { ChannelAvatar, PlatformIcon } from "@/components/platform-icon";
import { cn } from "@/lib/utils";
import { PLATFORM_INFO, type Platform } from "@/lib/platforms/catalog";
import type { PostFormat } from "@/lib/platforms/rules";
import type { ChannelView } from "@/lib/services/channels";
import type { MediaView } from "@/lib/services/media";
import { MediaThumb } from "./media-strip";

/** Roughly where each platform cuts text with a "more" link in the feed. */
const FOLD: Partial<Record<Platform, number>> = { linkedin: 210, instagram: 125, facebook: 480 };

export function Preview({
  channels,
  focus,
  textFor,
  formatFor,
  media,
}: {
  channels: ChannelView[];
  focus?: Platform;
  textFor: (p: Platform) => string;
  formatFor: (p: Platform) => PostFormat;
  media: MediaView[];
}) {
  const unique = [...new Map(channels.map((c) => [c.platform, c])).values()];
  const [picked, setPicked] = useState<Platform | undefined>();
  const [expanded, setExpanded] = useState(false);
  const current = unique.find((c) => c.platform === (focus ?? picked)) ?? unique[0];

  if (!current) {
    return <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Pick an account to see a preview.</div>;
  }
  const platform = current.platform;
  const text = textFor(platform);
  const format = formatFor(platform);
  const fold = FOLD[platform];
  const shown = fold && !expanded && text.length > fold ? `${text.slice(0, fold).trimEnd()}… ` : text;
  const mediaFirst = platform === "instagram";

  return (
    <div className="space-y-2">
      {!focus && unique.length > 1 ? (
        <div className="flex gap-1">
          {unique.map((c) => (
            <button
              key={c.platform}
              type="button"
              onClick={() => setPicked(c.platform)}
              className={cn("rounded-md p-1", c.platform === platform ? "bg-muted" : "opacity-60 hover:opacity-100")}
              aria-label={`Preview ${PLATFORM_INFO[c.platform].label}`}
            >
              <PlatformIcon platform={c.platform} />
            </button>
          ))}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border bg-background shadow-xs">
        <div className="flex items-center gap-2.5 p-3">
          <ChannelAvatar platform={platform} name={current.displayName} avatar={current.avatar} className="size-8" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium">{current.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {current.username ? `@${current.username}` : PLATFORM_INFO[platform].label}
              {format !== "feed" ? ` · ${format === "reel" ? "Reel" : "Story"}` : ""}
            </p>
          </div>
        </div>
        {mediaFirst ? <MediaBlock media={media} vertical={format !== "feed"} /> : null}
        {text ? (
          <p className="px-3 pt-0 pb-3 text-sm break-words whitespace-pre-wrap">
            {mediaFirst ? <span className="mr-1 font-medium">{current.username ?? current.displayName}</span> : null}
            {shown}
            {shown !== text ? (
              <button type="button" onClick={() => setExpanded(true)} className="text-muted-foreground hover:underline">
                {platform === "linkedin" ? "see more" : "more"}
              </button>
            ) : null}
          </p>
        ) : null}
        {!mediaFirst ? <MediaBlock media={media} vertical={format !== "feed"} /> : null}
      </div>
      <p className="text-xs text-muted-foreground">Previews are approximate; each app lays posts out its own way.</p>
    </div>
  );
}

function MediaBlock({ media, vertical }: { media: MediaView[]; vertical: boolean }) {
  if (media.length === 0) return null;
  if (media.length === 1 || vertical) {
    return <MediaThumb m={media[0]} className={cn("w-full rounded-none", vertical ? "aspect-[9/16] max-h-[420px]" : "aspect-square")} />;
  }
  return (
    <div className="grid grid-cols-2 gap-0.5">
      {media.slice(0, 4).map((m, i) => (
        <div key={m.id} className="relative">
          <MediaThumb m={m} className="aspect-square w-full rounded-none" />
          {i === 3 && media.length > 4 ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-medium text-white">+{media.length - 4}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
