"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChannelAvatar, Glyph, PlatformIcon, UPCOMING } from "@/components/platform-icon";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { PLATFORMS, PLATFORM_INFO, type Platform } from "@/lib/platforms/catalog";
import type { ChannelView } from "@/lib/services/channels";
import { connectBlueskyAction, connectTelegramAction, removeChannelAction, testChannelAction } from "./actions";

export function Flash({ error, connected }: { error?: string; connected?: string }) {
  if (error) return <p className="mb-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>;
  if (!connected) return null;
  const n = Number(connected);
  return (
    <p className="mb-6 rounded-xl bg-brand-soft px-4 py-3 text-sm">
      {Number.isFinite(n) && n > 0 ? `${n} channel${n > 1 ? "s" : ""} connected.` : "Channel connected."}
    </p>
  );
}

const oauthStart = (provider: "meta" | "instagram" | "linkedin" | "mastodon", instance?: string) =>
  `/api/connect/${provider}/start${instance ? `?instance=${encodeURIComponent(instance)}` : ""}`;

type FormKind = "telegram" | "bluesky" | "mastodon";

/** Starts the right connect flow for a platform: OAuth redirect, or one of the form dialogs. */
function useConnect() {
  const [form, setForm] = useState<FormKind | null>(null);
  const start = (platform: Platform) => {
    if (platform === "facebook") window.location.href = oauthStart("meta");
    else if (platform === "instagram") window.location.href = oauthStart("instagram");
    else if (platform === "linkedin") window.location.href = oauthStart("linkedin");
    else setForm(platform);
  };
  const dialogs = (
    <>
      <TelegramDialog open={form === "telegram"} onOpenChange={(o) => setForm(o ? "telegram" : null)} />
      <BlueskyDialog open={form === "bluesky"} onOpenChange={(o) => setForm(o ? "bluesky" : null)} />
      <MastodonDialog open={form === "mastodon"} onOpenChange={(o) => setForm(o ? "mastodon" : null)} />
    </>
  );
  return { start, dialogs };
}

export function ConnectButton() {
  const [open, setOpen] = useState(false);
  const { start, dialogs } = useConnect();
  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-11 rounded-xl px-5 text-[15px]">
        <Plus /> Connect Channel
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Connect a channel</DialogTitle>
            <DialogDescription>Pick a platform. You&apos;ll log in there and come straight back.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setOpen(false);
                  start(p);
                }}
                className="flex items-start gap-3 rounded-xl border p-3 text-left transition hover:border-foreground/25 hover:bg-muted/50"
              >
                <PlatformIcon platform={p} size="md" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{PLATFORM_INFO[p].label}</span>
                  <span className="block text-xs text-muted-foreground">{PLATFORM_INFO[p].connectHint}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Coming soon: {UPCOMING.map((u) => u.label).join(", ")}, Google Business Profile.</p>
        </DialogContent>
      </Dialog>
      {dialogs}
    </>
  );
}

export function PlatformStrip({ counts, manage }: { counts: Record<string, number>; manage: boolean }) {
  const { start, dialogs } = useConnect();
  return (
    <div className="flex flex-wrap gap-4 rounded-2xl bg-muted/60 p-5">
      {PLATFORMS.map((p) => {
        const n = counts[p] ?? 0;
        return (
          <Tooltip key={p}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  disabled={!manage}
                  onClick={() => start(p)}
                  className="relative rounded-xl transition hover:scale-105 disabled:hover:scale-100"
                  aria-label={`Connect ${PLATFORM_INFO[p].label}${n ? ` (${n} connected)` : ""}`}
                />
              }
            >
              <PlatformIcon platform={p} size="lg" muted={n === 0} className={cn(n === 0 && "opacity-70")} />
              {n > 0 ? (
                <span className="absolute -right-1.5 -bottom-1.5 flex size-5 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-brand-foreground ring-2 ring-muted">
                  {n}
                </span>
              ) : null}
            </TooltipTrigger>
            <TooltipContent>{n ? `${PLATFORM_INFO[p].label}: ${n} connected` : `Connect ${PLATFORM_INFO[p].label}`}</TooltipContent>
          </Tooltip>
        );
      })}
      {UPCOMING.map((u) => (
        <Tooltip key={u.key}>
          <TooltipTrigger render={<span className="flex size-12 items-center justify-center rounded-xl bg-muted-foreground/20 text-white opacity-60" />}>
            <Glyph path={u.path} className="size-7" />
          </TooltipTrigger>
          <TooltipContent>{u.label}: coming soon</TooltipContent>
        </Tooltip>
      ))}
      {dialogs}
    </div>
  );
}

function TelegramDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Telegram</DialogTitle>
          <DialogDescription>
            Create a bot with @BotFather, add it to your channel or group as an admin that can post, then paste the bot token and the channel.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await connectTelegramAction({ botToken, chatId });
              if (!res.ok) return void toast.error(res.error.message);
              toast.success("Telegram connected");
              setBotToken("");
              setChatId("");
              onOpenChange(false);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="tg-token">Bot token</Label>
            <Input id="tg-token" value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="123456789:AA…" autoComplete="off" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-chat">Channel or group</Label>
            <Input id="tg-chat" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="@yourchannel or -100…" required />
            <p className="text-xs text-muted-foreground">Public channels: @username. Private ones: the numeric id starting with -100.</p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Checking…" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BlueskyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Bluesky</DialogTitle>
          <DialogDescription>
            Use an app password, not your main password. Create one in Bluesky under Settings → Privacy and security → App passwords.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await connectBlueskyAction({ identifier, appPassword });
              if (!res.ok) return void toast.error(res.error.message);
              toast.success("Bluesky connected");
              setAppPassword("");
              onOpenChange(false);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="bs-handle">Handle</Label>
            <Input id="bs-handle" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="yourname.bsky.social" autoComplete="off" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bs-pass">App password</Label>
            <Input id="bs-pass" type="password" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" autoComplete="off" required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Checking…" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MastodonDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [instance, setInstance] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Mastodon</DialogTitle>
          <DialogDescription>Enter the server your account is on. You&apos;ll log in there and come back here.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = oauthStart("mastodon", instance.trim());
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="md-instance">Server</Label>
            <Input id="md-instance" value={instance} onChange={(e) => setInstance(e.target.value)} placeholder="mastodon.social" required />
          </div>
          <DialogFooter>
            <Button type="submit">Continue</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ChannelRow({ channel: c, manage, expiresLabel }: { channel: ChannelView; manage: boolean; expiresLabel?: string }) {
  const [confirm, setConfirm] = useState(false);
  const [reconnect, setReconnect] = useState<"telegram" | "bluesky" | null>(null);
  const [pending, start] = useTransition();

  const reconnectNow = () => {
    if (c.platform === "facebook") window.location.href = oauthStart("meta");
    else if (c.platform === "instagram") window.location.href = oauthStart(c.meta.loginType === "facebook" ? "meta" : "instagram");
    else if (c.platform === "linkedin") window.location.href = oauthStart("linkedin");
    else if (c.platform === "mastodon") window.location.href = oauthStart("mastodon", String(c.meta.instance ?? ""));
    else setReconnect(c.platform);
  };

  return (
    <li className="flex flex-wrap items-center gap-4 rounded-2xl border bg-background px-5 py-4">
      <ChannelAvatar platform={c.platform} name={c.displayName} avatar={c.avatar} className="size-12" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{c.displayName}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[15px] text-muted-foreground">
          <PlatformIcon platform={c.platform} size="sm" />
          {PLATFORM_INFO[c.platform].label}
          {c.username ? <span className="truncate">· @{c.username}</span> : null}
        </p>
        {c.status !== "active" && c.lastError ? <p className="mt-1 text-sm text-destructive">{c.lastError}</p> : null}
        {c.status === "active" && expiresLabel ? <p className="mt-1 text-xs text-muted-foreground">Login valid until {expiresLabel}</p> : null}
      </div>
      {c.status !== "active" ? <StatusBadge status={c.status} /> : null}
      {manage ? (
        <div className="flex items-center gap-1">
          <button type="button" onClick={reconnectNow} className="rounded-lg px-3 py-1.5 text-[15px] font-medium text-brand hover:bg-brand-soft">
            Reconnect
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More options" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await testChannelAction(c.id);
                    if (res.ok) toast.success(`${c.displayName} is working`);
                    else toast.error(res.error.message);
                  })
                }
              >
                Test connection
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${c.displayName}`} onClick={() => setConfirm(true)}>
            <Trash2 className="text-muted-foreground" />
          </Button>
        </div>
      ) : null}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {c.displayName}?</DialogTitle>
            <DialogDescription>Scheduled posts to this channel will be cancelled. Posts already published stay on {PLATFORM_INFO[c.platform].label}.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await removeChannelAction(c.id);
                  if (!res.ok) return void toast.error(res.error.message);
                  toast.success("Channel removed");
                  setConfirm(false);
                })
              }
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TelegramDialog open={reconnect === "telegram"} onOpenChange={(o) => setReconnect(o ? "telegram" : null)} />
      <BlueskyDialog open={reconnect === "bluesky"} onOpenChange={(o) => setReconnect(o ? "bluesky" : null)} />
    </li>
  );
}
