"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronDown, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUploader } from "@/components/media/use-uploader";
import { cn } from "@/lib/utils";
import {
  parseYouTubeTags,
  YOUTUBE_CATEGORIES,
  YOUTUBE_TAGS_MAX,
  YOUTUBE_THUMBNAIL,
  youtubeTagsLength,
  type YouTubeCategoryId,
} from "@/lib/platforms/rules";
import type { MediaView } from "@/lib/services/media";
import type { PlatformOverride } from "@/lib/services/posts";

type Patch = Partial<PlatformOverride>;

/** The optional YouTube details: tags, category, disclosures, notifications and thumbnail. */
export function YouTubeMoreOptions({
  value,
  onChange,
  thumbnail,
  onThumbnail,
  isShort,
}: {
  value: PlatformOverride;
  onChange: (patch: Patch) => void;
  thumbnail?: MediaView;
  onThumbnail: (m: MediaView | undefined) => void;
  isShort: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tagsText, setTagsText] = useState(value.tags?.join(", ") ?? "");
  const tags = parseYouTubeTags(tagsText);
  const tagChars = youtubeTagsLength(tags);
  // Store only what differs from YouTube's default, so old posts and new ones read the same.
  const set = (k: "aiContent" | "paidPromotion" | "notifySubscribers" | "embeddable", on: boolean, defaultOn = false) =>
    onChange({ [k]: on === defaultOn ? undefined : on } as Patch);

  return (
    <div className="sm:col-span-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-sm font-medium" aria-expanded={open}>
        <ChevronDown className={cn("size-4 transition", !open && "-rotate-90")} />
        More YouTube options
      </button>
      {open ? (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="yt-tags" className="text-xs">
              Tags <span className="font-normal text-muted-foreground">(comma separated)</span>
            </Label>
            <Input
              id="yt-tags"
              value={tagsText}
              onChange={(e) => {
                setTagsText(e.target.value);
                const next = parseYouTubeTags(e.target.value);
                onChange({ tags: next.length ? next : undefined });
              }}
              placeholder="ai video, ugc, product demo"
            />
            <p className={cn("text-xs text-muted-foreground tabular-nums", tagChars > YOUTUBE_TAGS_MAX && "font-medium text-destructive")}>
              {tags.length} tag{tags.length === 1 ? "" : "s"} · {tagChars} / {YOUTUBE_TAGS_MAX} characters
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="yt-category" className="text-xs">
              Category
            </Label>
            <select
              id="yt-category"
              className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
              value={value.categoryId ?? "22"}
              onChange={(e) => onChange({ categoryId: e.target.value === "22" ? undefined : (e.target.value as YouTubeCategoryId) })}
            >
              {YOUTUBE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2.5 sm:col-span-2">
            <Toggle
              checked={value.aiContent ?? false}
              onChange={(on) => set("aiContent", on)}
              label="Altered or synthetic content"
              hint="Realistic video made or changed with AI. YouTube requires you to disclose it."
            />
            <Toggle
              checked={value.paidPromotion ?? false}
              onChange={(on) => set("paidPromotion", on)}
              label="Includes paid promotion"
              hint="Sponsorships, product placement or endorsements."
            />
            <Toggle checked={value.notifySubscribers ?? true} onChange={(on) => set("notifySubscribers", on, true)} label="Notify subscribers" />
            <Toggle checked={value.embeddable ?? true} onChange={(on) => set("embeddable", on, true)} label="Allow embedding on other websites" />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Thumbnail</Label>
            {isShort ? (
              <p className="text-xs text-muted-foreground">YouTube doesn&apos;t let apps set a Short&apos;s thumbnail. Choose it in the YouTube app after it&apos;s posted.</p>
            ) : (
              <ThumbnailPicker
                thumbnail={thumbnail}
                onPick={(m) => {
                  onThumbnail(m);
                  onChange({ thumbnailId: m?.id });
                }}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (on: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

function ThumbnailPicker({ thumbnail, onPick }: { thumbnail?: MediaView; onPick: (m: MediaView | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const onUploaded = useCallback((m: MediaView) => onPick(m), [onPick]);
  const { items, upload } = useUploader({ onUploaded });
  const uploading = items.find((i) => i.progress < 1 && !i.error);

  if (thumbnail) {
    return (
      <div className="relative w-48">
        {/* eslint-disable-next-line @next/next/no-img-element -- CDN media, exact bytes */}
        <img src={thumbnail.url} alt="Thumbnail" className="aspect-video w-full rounded-lg bg-muted object-cover" />
        <button type="button" onClick={() => onPick(undefined)} className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white" aria-label="Remove thumbnail">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={!!uploading} onClick={() => input.current?.click()}>
        <ImagePlus /> {uploading ? `Uploading ${Math.round(uploading.progress * 100)}%` : "Upload thumbnail"}
      </Button>
      <span className="text-xs text-muted-foreground">JPEG or PNG, 1280×720, under 2 MB. Needs a phone-verified channel.</span>
      <input
        ref={input}
        type="file"
        accept={YOUTUBE_THUMBNAIL.mimes.join(",")}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (!(YOUTUBE_THUMBNAIL.mimes as readonly string[]).includes(file.type)) return void toast.error("Use a JPEG or PNG image.");
          if (file.size > YOUTUBE_THUMBNAIL.maxBytes) return void toast.error("Thumbnails must be under 2 MB.");
          upload([file]);
        }}
      />
    </div>
  );
}
