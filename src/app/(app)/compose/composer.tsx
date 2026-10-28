"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PlatformIcon } from "@/components/platform-icon";
import { cn } from "@/lib/utils";
import { PLATFORM_INFO, type Platform } from "@/lib/platforms/catalog";
import {
  charLimit,
  countText,
  formatLabel,
  PLATFORM_RULES,
  validatePost,
  youtubeTitle,
  YOUTUBE_TITLE_MAX,
  type Issue,
  type PostFormat,
  type YouTubePrivacy,
} from "@/lib/platforms/rules";
import type { ChannelView } from "@/lib/services/channels";
import type { MediaView } from "@/lib/services/media";
import type { PlatformOverride, PostGroupView } from "@/lib/services/posts";
import { savePostAction } from "./actions";
import { ChannelPicker } from "./channel-picker";
import { MediaStrip } from "./media-strip";
import { Preview } from "./preview";
import { YouTubeMoreOptions } from "./youtube-options";

type Override = PlatformOverride;
type Mode = "schedule" | "queue" | "now";

interface Props {
  channels: ChannelView[];
  timezone: string;
  existing?: PostGroupView;
  initialAt?: string;
  canPublish: boolean;
  preselect?: string;
}

function defaultTime(tz: string, initialAt?: string) {
  const base = initialAt ? new Date(initialAt) : new Date(Math.ceil((Date.now() + 30 * 60_000) / 3_600_000) * 3_600_000);
  return { date: formatInTimeZone(base, tz, "yyyy-MM-dd"), time: formatInTimeZone(base, tz, "HH:mm") };
}

export function Composer({ channels, timezone, existing, initialAt, canPublish, preselect }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>(
    existing?.channelIds.filter((id) => channels.some((c) => c.id === id)) ??
      (preselect && channels.some((c) => c.id === preselect) ? [preselect] : []),
  );
  const [content, setContent] = useState(existing?.content ?? "");
  const [overrides, setOverrides] = useState<Partial<Record<Platform, Override>>>(existing?.perPlatform ?? {});
  const [firstComment, setFirstComment] = useState(existing?.firstComment ?? "");
  const [media, setMedia] = useState<MediaView[]>(existing?.media ?? []);
  const [ytThumbnail, setYtThumbnail] = useState<MediaView | undefined>(existing?.youtubeThumbnail);
  const [tab, setTab] = useState<"all" | Platform>("all");
  const [mode, setMode] = useState<Mode>("schedule");
  const initial = defaultTime(timezone, existing?.scheduledAt ?? initialAt);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [serverIssues, setServerIssues] = useState<Record<string, Issue[]>>({});

  const chosen = useMemo(() => channels.filter((c) => selected.includes(c.id)), [channels, selected]);
  const platforms = useMemo(() => [...new Set(chosen.map((c) => c.platform))], [chosen]);
  const activeTab = tab !== "all" && platforms.includes(tab) ? tab : "all";

  const textFor = (p: Platform) => overrides[p]?.content ?? content;
  const formatFor = (p: Platform): PostFormat => overrides[p]?.format ?? "feed";

  const issues = useMemo(() => {
    const out: { channel: ChannelView; issues: Issue[] }[] = [];
    for (const c of chosen) {
      const list = validatePost({
        platform: c.platform,
        text: overrides[c.platform]?.content ?? content,
        format: overrides[c.platform]?.format ?? "feed",
        maxCharsOverride: (c.meta as { maxChars?: number }).maxChars,
        media: media.map((m) => ({ ...m })),
      });
      if (c.status !== "active") list.unshift({ severity: "error", code: "CHANNEL_NOT_ACTIVE", message: "Reconnect this account before posting." });
      const fromServer = serverIssues[c.id] ?? [];
      const merged = [...list, ...fromServer.filter((s) => !list.some((l) => l.code === s.code))];
      if (merged.length) out.push({ channel: c, issues: merged });
    }
    return out;
  }, [chosen, overrides, content, media, serverIssues]);
  const hasErrors = issues.some((i) => i.issues.some((x) => x.severity === "error"));

  // Strictest limit across chosen platforms, for the shared editor's counter.
  const counter = useMemo(() => {
    const p = activeTab === "all" ? platforms : [activeTab];
    if (p.length === 0) return null;
    const limits = p.map((pl) => {
      const maxOverride = chosen.filter((c) => c.platform === pl).map((c) => (c.meta as { maxChars?: number }).maxChars).filter(Boolean) as number[];
      return { pl, limit: charLimit(pl, media.length > 0, maxOverride.length ? Math.min(...maxOverride) : undefined) };
    });
    const strictest = limits.reduce((a, b) => (b.limit < a.limit ? b : a));
    const text = activeTab === "all" ? content : textFor(activeTab);
    return { used: countText(text, PLATFORM_RULES[strictest.pl].countMode), ...strictest };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, platforms, chosen, media.length, content, overrides]);

  const setOverride = (p: Platform, patch: Partial<Override>) =>
    setOverrides((o) => {
      const next = { ...o[p], ...patch };
      (Object.keys(next) as (keyof Override)[]).forEach((k) => next[k] === undefined && delete next[k]);
      return { ...o, [p]: next };
    });

  function submit(kind: "draft" | Mode) {
    const when =
      kind === "draft"
        ? { mode: "draft" as const }
        : kind === "now"
          ? { mode: "now" as const }
          : kind === "queue"
            ? { mode: "queue" as const }
            : { mode: "schedule" as const, scheduledAt: fromZonedTime(`${date}T${time}:00`, timezone).toISOString() };
    start(async () => {
      const res = await savePostAction(
        {
          content,
          channelIds: selected,
          mediaIds: media.map((m) => m.id),
          firstComment: firstComment || undefined,
          perPlatform: Object.fromEntries(platforms.map((p) => [p, overrides[p] ?? {}])),
          when,
        },
        existing?.id,
      );
      if (!res.ok) {
        const details = res.error.details as { channelId: string; issues: Issue[] }[] | undefined;
        if (Array.isArray(details)) setServerIssues(Object.fromEntries(details.map((d) => [d.channelId, d.issues])));
        toast.error(res.error.message);
        return;
      }
      setServerIssues({});
      const at = res.data.scheduledAt ? formatInTimeZone(new Date(res.data.scheduledAt), timezone, "d MMM, h:mm a") : undefined;
      toast.success(kind === "draft" ? "Draft saved" : kind === "now" ? "Publishing now" : `Scheduled for ${at}`);
      router.push(`/posts/${res.data.id}`);
    });
  }

  const rulesFor = activeTab === "all" ? null : PLATFORM_RULES[activeTab];
  const overridden = activeTab !== "all" && overrides[activeTab]?.content !== undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <section className="space-y-2">
          <Label>Post to</Label>
          <ChannelPicker channels={channels} selected={selected} onChange={setSelected} />
        </section>

        <section className="rounded-xl border">
          <div className="flex gap-1 overflow-x-auto border-b px-2 pt-2">
            <TabButton active={activeTab === "all"} onClick={() => setTab("all")}>
              All accounts
            </TabButton>
            {platforms.map((p) => (
              <TabButton key={p} active={activeTab === p} onClick={() => setTab(p)}>
                <PlatformIcon platform={p} size="sm" />
                {PLATFORM_INFO[p].label}
                {overrides[p]?.content !== undefined ? <span className="size-1.5 rounded-full bg-orange-500" title="Customised" /> : null}
              </TabButton>
            ))}
          </div>

          <div className="space-y-3 p-3">
            {activeTab !== "all" ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={overridden}
                    onCheckedChange={(on) => setOverride(activeTab, { content: on ? content : undefined })}
                  />
                  Custom text for {PLATFORM_INFO[activeTab].label}
                </label>
                {rulesFor?.formats ? (
                  <select
                    className="h-8 rounded-lg border bg-background px-2 text-sm"
                    value={formatFor(activeTab)}
                    onChange={(e) => setOverride(activeTab, { format: e.target.value as PostFormat })}
                    aria-label="Post type"
                  >
                    {rulesFor.formats.map((f) => (
                      <option key={f} value={f}>
                        {formatLabel(activeTab, f)}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            ) : null}

            {activeTab === "youtube" ? (
              <div className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-1">
                  <Label htmlFor="yt-title" className="text-xs">
                    Video title
                  </Label>
                  <Input
                    id="yt-title"
                    value={overrides.youtube?.title ?? ""}
                    maxLength={YOUTUBE_TITLE_MAX}
                    onChange={(e) => setOverride("youtube", { title: e.target.value || undefined })}
                    placeholder={youtubeTitle(undefined, textFor("youtube"), media.find((m) => m.kind === "video")?.filename)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="yt-privacy" className="text-xs">
                    Visibility
                  </Label>
                  <select
                    id="yt-privacy"
                    className="h-9 rounded-lg border bg-background px-2 text-sm"
                    value={overrides.youtube?.privacy ?? "public"}
                    onChange={(e) => setOverride("youtube", { privacy: e.target.value as YouTubePrivacy })}
                  >
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Switch checked={overrides.youtube?.madeForKids ?? false} onCheckedChange={(on) => setOverride("youtube", { madeForKids: on || undefined })} />
                  Made for kids <span className="text-xs text-muted-foreground">(YouTube requires you to say)</span>
                </label>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  The post text becomes the video description. Without a title, the first line of the text is used.
                </p>
                <YouTubeMoreOptions
                  value={overrides.youtube ?? {}}
                  onChange={(patch) => setOverride("youtube", patch)}
                  thumbnail={ytThumbnail}
                  onThumbnail={setYtThumbnail}
                  isShort={formatFor("youtube") === "reel"}
                />
              </div>
            ) : null}

            <Textarea
              value={activeTab === "all" || !overridden ? content : textFor(activeTab)}
              onChange={(e) => (activeTab === "all" || !overridden ? setContent(e.target.value) : setOverride(activeTab, { content: e.target.value }))}
              placeholder={activeTab === "all" ? "What do you want to share?" : `Text for ${PLATFORM_INFO[activeTab].label}`}
              className="min-h-44 resize-y border-0 px-1 text-[15px] shadow-none focus-visible:ring-0"
              disabled={activeTab !== "all" && !overridden}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {activeTab !== "all" && !overridden ? "Using the shared text. Turn on custom text to change it here." : " "}
              </span>
              {counter ? (
                <span className={cn("tabular-nums", counter.used > counter.limit && "font-medium text-destructive")}>
                  {counter.used.toLocaleString()} / {counter.limit.toLocaleString()}
                  {activeTab === "all" && platforms.length > 1 ? ` (${PLATFORM_INFO[counter.pl].label})` : ""}
                </span>
              ) : null}
            </div>
            <MediaStrip media={media} onChange={setMedia} />
          </div>
        </section>

        {platforms.some((p) => PLATFORM_RULES[p].firstComment) ? (
          <section className="space-y-1.5">
            <Label htmlFor="first-comment">
              First comment <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="first-comment"
              value={activeTab !== "all" && overrides[activeTab]?.firstComment !== undefined ? overrides[activeTab]!.firstComment : firstComment}
              onChange={(e) => (activeTab === "all" ? setFirstComment(e.target.value) : setOverride(activeTab, { firstComment: e.target.value }))}
              placeholder="Links or hashtags you'd rather keep out of the post"
              className="min-h-16"
            />
            <p className="text-xs text-muted-foreground">
              Posted right after the post on {platforms.filter((p) => PLATFORM_RULES[p].firstComment).map((p) => PLATFORM_INFO[p].label).join(", ")}.
            </p>
          </section>
        ) : null}

        <section className="space-y-3 rounded-xl border p-3">
          <div className="flex flex-wrap gap-1">
            {(["schedule", "queue", "now"] as Mode[]).map((m) => (
              <TabButton key={m} pill active={mode === m} onClick={() => setMode(m)}>
                {m === "schedule" ? "Pick a time" : m === "queue" ? "Add to queue" : "Publish now"}
              </TabButton>
            ))}
          </div>
          {mode === "schedule" ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="date" className="text-xs">Date</Label>
                <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="time" className="text-xs">Time</Label>
                <input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm" />
              </div>
              <span className="pb-2 text-xs text-muted-foreground">{timezone.replace("_", " ")}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {mode === "queue" ? "Goes out at the next free posting time you set on the Queue page." : "Sends to every chosen account right away."}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="outline" disabled={pending} onClick={() => submit("draft")}>
              Save draft
            </Button>
            <Button disabled={pending || !canPublish || selected.length === 0 || hasErrors} onClick={() => submit(mode)}>
              {pending ? "Saving…" : mode === "now" ? "Publish now" : mode === "queue" ? "Add to queue" : existing?.status === "scheduled" ? "Update schedule" : "Schedule"}
            </Button>
          </div>
          {!canPublish ? <p className="text-right text-xs text-muted-foreground">Your role can save drafts but not publish.</p> : null}
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        {issues.length ? (
          <div className="space-y-2 rounded-xl border p-3">
            {issues.map(({ channel, issues: list }) => (
              <div key={channel.id} className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <PlatformIcon platform={channel.platform} size="sm" /> {channel.displayName}
                </p>
                {list.map((i, idx) => (
                  <p key={idx} className={cn("flex gap-1.5 text-xs", i.severity === "error" ? "text-destructive" : "text-amber-700")}>
                    {i.severity === "error" ? <CircleAlert className="mt-px size-3.5 shrink-0" /> : <AlertTriangle className="mt-px size-3.5 shrink-0" />}
                    {i.message}
                  </p>
                ))}
              </div>
            ))}
          </div>
        ) : null}
        <Preview
          channels={chosen}
          focus={activeTab === "all" ? undefined : activeTab}
          textFor={textFor}
          formatFor={formatFor}
          media={media}
        />
      </aside>
    </div>
  );
}

function TabButton({ active, pill, onClick, children }: { active: boolean; pill?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm transition-colors",
        pill ? "rounded-full border" : "-mb-px rounded-t-lg border-b-2",
        active
          ? pill
            ? "border-foreground bg-foreground text-background"
            : "border-foreground font-medium"
          : pill
            ? "text-muted-foreground hover:bg-muted"
            : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
