"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { EyeOff, Globe, Lock, Tag, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PlatformIcon } from "@/components/platform-icon";
import { useUploader } from "@/components/media/use-uploader";
import { cn } from "@/lib/utils";
import {
  parseYouTubeTags,
  YOUTUBE_CATEGORIES,
  YOUTUBE_TAGS_MAX,
  YOUTUBE_THUMBNAIL,
  YOUTUBE_TITLE_MAX,
  youtubeCanUsePlaylists,
  youtubeTagsLength,
  youtubeTitle,
  type PostFormat,
  type YouTubeCategoryId,
  type YouTubePrivacy,
} from "@/lib/platforms/rules";
import type { ChannelView } from "@/lib/services/channels";
import type { MediaView } from "@/lib/services/media";
import type { PlatformOverride } from "@/lib/services/posts";
import { youtubePlaylistsAction } from "./actions";

type Patch = Partial<PlatformOverride>;

const VISIBILITY: { value: YouTubePrivacy; label: string; icon: typeof Globe; hint: string }[] = [
  { value: "public", label: "Public", icon: Globe, hint: "Anyone can search for and view" },
  { value: "unlisted", label: "Unlisted", icon: EyeOff, hint: "Anyone with the link can view" },
  { value: "private", label: "Private", icon: Lock, hint: "Only you and people you choose can view" },
];

/** Everything YouTube-specific for a post, in one card under the editor. */
export function YouTubeSettings({
  value,
  onChange,
  format,
  onFormat,
  channels,
  text,
  videoFilename,
  thumbnail,
  onThumbnail,
}: {
  value: PlatformOverride;
  onChange: (patch: Patch) => void;
  format: PostFormat;
  onFormat: (f: PostFormat) => void;
  /** The selected YouTube channels. */
  channels: ChannelView[];
  text: string;
  videoFilename?: string;
  thumbnail?: MediaView;
  onThumbnail: (m: MediaView | undefined) => void;
}) {
  const privacy = value.privacy ?? "public";
  const isShort = format === "reel";
  // Store only what differs from YouTube's defaults, so old posts and new ones read the same.
  const set = (k: "aiContent" | "paidPromotion" | "notifySubscribers" | "embeddable" | "madeForKids", on: boolean, defaultOn = false) =>
    onChange({ [k]: on === defaultOn ? undefined : on } as Patch);

  return (
    <section className="overflow-hidden rounded-xl border">
      <header className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <PlatformIcon platform="youtube" size="md" />
          <h2 className="font-semibold">YouTube Settings</h2>
        </div>
        <div className="flex rounded-lg border p-0.5 text-sm" role="radiogroup" aria-label="YouTube post type">
          {(["feed", "reel"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={format === f}
              onClick={() => onFormat(f)}
              className={cn("rounded-md px-3 py-1", format === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {f === "feed" ? "Video" : "Short"}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-6 p-4">
        <Field label="Video title" htmlFor="yt-title" aside={`${Array.from(value.title ?? "").length}/${YOUTUBE_TITLE_MAX}`}>
          <Input
            id="yt-title"
            value={value.title ?? ""}
            maxLength={YOUTUBE_TITLE_MAX}
            onChange={(e) => onChange({ title: e.target.value || undefined })}
            placeholder={text.trim() || videoFilename ? `Defaults to: ${youtubeTitle(undefined, text, videoFilename)}` : "Enter a compelling title for your video"}
            className="h-10"
          />
        </Field>

        <Field label="Visibility">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Visibility">
            {VISIBILITY.map((v) => (
              <button
                key={v.value}
                type="button"
                role="radio"
                aria-checked={privacy === v.value}
                onClick={() => onChange({ privacy: v.value === "public" ? undefined : v.value })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-medium transition",
                  privacy === v.value ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400" : "hover:border-foreground/30",
                )}
              >
                <v.icon className="size-5" />
                {v.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{VISIBILITY.find((v) => v.value === privacy)!.hint}</p>
        </Field>

        <TagsField tags={value.tags ?? []} onChange={(tags) => onChange({ tags: tags.length ? tags : undefined })} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
            <Checkbox checked={value.madeForKids ?? false} onCheckedChange={(on) => set("madeForKids", on === true)} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Made for kids</span>
              <span className="block text-xs text-muted-foreground">Sent to YouTube as the audience declaration. YouTube requires every video to say.</span>
            </span>
          </label>
          <Field label="Category" htmlFor="yt-category">
            <select
              id="yt-category"
              className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
              value={value.categoryId ?? "22"}
              onChange={(e) => onChange({ categoryId: e.target.value === "22" ? undefined : (e.target.value as YouTubeCategoryId) })}
            >
              {YOUTUBE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.id === "22" ? " (default)" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <PlaylistField value={value} onChange={onChange} channels={channels} />

        <Field label="Custom thumbnail" aside="JPEG/PNG, 2 MB max">
          {isShort ? (
            <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
              YouTube doesn&apos;t let apps set a Short&apos;s thumbnail. Choose it in the YouTube app after it&apos;s posted.
            </p>
          ) : (
            <ThumbnailPicker
              thumbnail={thumbnail}
              onPick={(m) => {
                onThumbnail(m);
                onChange({ thumbnailId: m?.id });
              }}
            />
          )}
          {!isShort ? <p className="text-xs text-muted-foreground">1280×720 recommended. Custom thumbnails need a phone-verified channel (youtube.com/verify).</p> : null}
        </Field>

        <Field label="Disclosures and distribution">
          <div className="space-y-3 rounded-xl border p-3">
            <Toggle
              checked={value.aiContent ?? false}
              onChange={(on) => set("aiContent", on)}
              label="Altered or synthetic content"
              hint="Realistic video made or changed with AI. YouTube requires you to disclose it."
            />
            <Toggle checked={value.paidPromotion ?? false} onChange={(on) => set("paidPromotion", on)} label="Includes paid promotion" hint="Sponsorships, product placement or endorsements." />
            <Toggle checked={value.notifySubscribers ?? true} onChange={(on) => set("notifySubscribers", on, true)} label="Notify subscribers" />
            <Toggle checked={value.embeddable ?? true} onChange={(on) => set("embeddable", on, true)} label="Allow embedding on other websites" />
          </div>
        </Field>

        <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Note:</span> The post text is used as the video description. A thumbnail or playlist that YouTube refuses doesn&apos;t stop the video
          from publishing; the post&apos;s log says what happened.
        </p>
      </div>
    </section>
  );
}

function Field({ label, htmlFor, aside, children }: { label: string; htmlFor?: string; aside?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {aside ? <span className="text-xs text-muted-foreground tabular-nums">{aside}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (on: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

function TagsField({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const used = youtubeTagsLength(tags);
  const add = () => {
    const next = parseYouTubeTags([...tags, draft].join(","));
    if (youtubeTagsLength(next) > YOUTUBE_TAGS_MAX) return void toast.error(`Tags can add up to ${YOUTUBE_TAGS_MAX} characters.`);
    onChange(next);
    setDraft("");
  };
  return (
    <Field label="Tags" htmlFor="yt-tags" aside={`${used}/${YOUTUBE_TAGS_MAX}`}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="yt-tags"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              } else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (pasted.includes(",")) {
                e.preventDefault();
                setDraft("");
                const next = parseYouTubeTags([...tags, pasted].join(","));
                if (youtubeTagsLength(next) <= YOUTUBE_TAGS_MAX) onChange(next);
                else toast.error(`Tags can add up to ${YOUTUBE_TAGS_MAX} characters.`);
              }
            }}
            placeholder="Add tags separated by commas"
            className="h-10 pl-9"
          />
        </div>
        <Button type="button" variant="outline" className="h-10" onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
      {tags.length ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pr-1.5 pl-3 text-sm">
              {t}
              <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="rounded-full p-0.5 hover:bg-foreground/10" aria-label={`Remove tag ${t}`}>
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </Field>
  );
}

type PlaylistState = { channelId: string; items?: { id: string; title: string }[]; error?: string };

function PlaylistField({ value, onChange, channels }: { value: PlatformOverride; onChange: (patch: Patch) => void; channels: ChannelView[] }) {
  const only = channels.length === 1 ? channels[0] : undefined;
  const allowed = only ? youtubeCanUsePlaylists(only.meta) : false;
  const [state, setState] = useState<PlaylistState | null>(null);

  const onlyId = only?.id;

  const fetchPlaylists = (channelId: string) =>
    youtubePlaylistsAction(channelId).then((res): PlaylistState =>
      res.ok ? { channelId, items: res.data } : { channelId, error: res.error.message },
    );

  useEffect(() => {
    if (!onlyId || !allowed) return;
    let live = true;
    void fetchPlaylists(onlyId).then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, [onlyId, allowed]);

  if (!only) {
    return (
      <Field label="Playlist">
        <p className="text-xs text-muted-foreground">Choose a playlist when posting to a single YouTube channel.</p>
      </Field>
    );
  }
  if (!allowed) {
    return (
      <Field label="Playlist">
        <p className="text-xs text-muted-foreground">
          {only.displayName} was connected before playlists were supported.{" "}
          <Link href="/channels" className="font-medium text-foreground underline underline-offset-2">
            Reconnect it
          </Link>{" "}
          to choose a playlist.
        </p>
      </Field>
    );
  }

  const current = state?.channelId === only.id ? state : null;
  // Keep showing the saved choice even before the list loads, or if it was deleted on YouTube.
  const selected = value.playlistChannelId === only.externalId ? value.playlistId : undefined;
  const options = [...(current?.items ?? [])];
  if (selected && !options.some((p) => p.id === selected)) options.unshift({ id: selected, title: value.playlistTitle ?? "Saved playlist" });

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor="yt-playlist" className="text-sm font-medium">
          Playlist
        </Label>
        <button
          type="button"
          onClick={() => {
            setState(null);
            void fetchPlaylists(only.id).then(setState);
          }}
          className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
        >
          Refresh
        </button>
      </div>
      <select
        id="yt-playlist"
        className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
        value={selected ?? ""}
        onChange={(e) => {
          const p = options.find((x) => x.id === e.target.value);
          onChange(p ? { playlistId: p.id, playlistTitle: p.title, playlistChannelId: only.externalId } : { playlistId: undefined, playlistTitle: undefined, playlistChannelId: undefined });
        }}
      >
        <option value="">{!current ? "Loading playlists…" : current.items && !current.items.length ? "No playlists on this channel" : "No playlist"}</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      <p className={cn("text-xs", current?.error ? "text-destructive" : "text-muted-foreground")}>
        {current?.error ?? "Optional. The video is added to the playlist right after it uploads."}
      </p>
    </div>
  );
}

function ThumbnailPicker({ thumbnail, onPick }: { thumbnail?: MediaView; onPick: (m: MediaView | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const onUploaded = useCallback((m: MediaView) => onPick(m), [onPick]);
  const { items, upload } = useUploader({ onUploaded });
  const uploading = items.find((i) => i.progress < 1 && !i.error);

  const take = (file: File | undefined) => {
    if (!file) return;
    if (!(YOUTUBE_THUMBNAIL.mimes as readonly string[]).includes(file.type)) return void toast.error("Use a JPEG or PNG image.");
    if (file.size > YOUTUBE_THUMBNAIL.maxBytes) return void toast.error("Thumbnails must be under 2 MB.");
    upload([file]);
  };

  if (thumbnail) {
    return (
      <div className="relative w-full max-w-xs">
        {/* eslint-disable-next-line @next/next/no-img-element -- CDN media, exact bytes */}
        <img src={thumbnail.url} alt="Thumbnail" className="aspect-video w-full rounded-xl bg-muted object-cover" />
        <button type="button" onClick={() => onPick(undefined)} className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white" aria-label="Remove thumbnail">
          <X className="size-4" />
        </button>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={!!uploading}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          take(e.dataTransfer.files[0]);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-sm font-medium transition hover:border-foreground/30 hover:bg-muted/40 disabled:opacity-70"
      >
        <Upload className="size-4" />
        {uploading ? `Uploading ${Math.round(uploading.progress * 100)}%` : "Upload thumbnail"}
      </button>
      <input
        ref={input}
        type="file"
        accept={YOUTUBE_THUMBNAIL.mimes.join(",")}
        hidden
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}
