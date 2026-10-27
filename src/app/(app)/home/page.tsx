import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Check, Link2, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { ChannelAvatar, PlatformIcon } from "@/components/platform-icon";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { requireCtx } from "@/lib/session";
import { getHomeSummary } from "@/lib/services/home";
import { formatInTz } from "@/lib/time";

export const metadata: Metadata = { title: "Home" };

function greeting(hour: number) {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function Stat({ label, value, icon: Icon, href, tone }: { label: string; value: number; icon: typeof Send; href: string; tone?: "warn" }) {
  return (
    <Link href={href} className="group rounded-2xl border bg-background p-5 transition hover:border-foreground/20">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-sm">{label}</span>
        <Icon className={cn("size-4", tone === "warn" && value > 0 && "text-destructive")} />
      </div>
      <p className={cn("mt-3 font-display text-3xl font-bold tabular-nums", tone === "warn" && value > 0 && "text-destructive")}>{value}</p>
    </Link>
  );
}

async function Content() {
  const ctx = await requireCtx();
  const home = await getHomeSummary(ctx);
  const hour = Number(formatInTz(new Date(), ctx.timezone, "H"));
  const steps = [
    { done: home.checklist.channel, label: "Connect your first channel", href: "/channels" },
    { done: home.checklist.post, label: "Create your first post", href: "/compose" },
    { done: home.checklist.queue, label: "Set weekly posting times", href: "/queue" },
    { done: home.checklist.team, label: "Invite a teammate", href: "/team" },
  ];
  const showChecklist = steps.some((s) => !s.done);

  return (
    <>
      <PageHeader
        title={`${greeting(hour)}, ${home.firstName}`}
        description={`Here's what's happening in ${home.workspaceName}.`}
        actions={
          <Button render={<Link href="/compose" />} className="h-10 rounded-xl px-4">
            <Plus /> New Draft
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Scheduled" value={home.stats.scheduled} icon={CalendarClock} href="/posts?tab=scheduled" />
        <Stat label="Published this month" value={home.stats.publishedThisMonth} icon={Send} href="/posts?tab=published" />
        <Stat label="Failed" value={home.stats.failed} icon={AlertTriangle} href="/posts?tab=failed" tone="warn" />
        <Stat label="Channels" value={home.stats.channels} icon={Link2} href="/channels" />
      </div>

      {showChecklist ? (
        <section className="mt-6 rounded-2xl border bg-background p-5">
          <h2 className="font-semibold">Get set up</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/60">
                  <span className={cn("flex size-6 items-center justify-center rounded-full border", s.done && "border-brand bg-brand text-brand-foreground")}>
                    {s.done ? <Check className="size-3.5" /> : null}
                  </span>
                  <span className={cn("text-[15px]", s.done && "text-muted-foreground line-through")}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-2xl border bg-background">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-semibold">Coming up</h2>
            <Link href="/calendar" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Calendar <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {home.upcoming.length === 0 ? (
            <p className="px-5 pb-6 text-[15px] text-muted-foreground">
              Nothing scheduled yet.{" "}
              <Link href="/compose" className="text-foreground underline underline-offset-4">
                Schedule a post
              </Link>
            </p>
          ) : (
            <ul className="divide-y">
              {home.upcoming.map((p) => (
                <li key={p.id}>
                  <Link href={`/posts/${p.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40">
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-medium">{formatInTz(p.scheduledAt, ctx.timezone, "EEE d MMM")}</p>
                      <p className="text-xs text-muted-foreground">{formatInTz(p.scheduledAt, ctx.timezone, "h:mm a")}</p>
                    </div>
                    <p className="min-w-0 flex-1 truncate text-[15px]">{p.snippet || <span className="text-muted-foreground">Media only</span>}</p>
                    <div className="flex -space-x-1">
                      {p.platforms.map((pl) => (
                        <PlatformIcon key={pl} platform={pl} size="sm" className="ring-2 ring-background" />
                      ))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border bg-background">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-semibold">Channels</h2>
            <Link href="/channels" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Manage <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {home.channels.length === 0 ? (
            <div className="px-5 pb-6">
              <p className="text-[15px] text-muted-foreground">No channels connected.</p>
              <Button render={<Link href="/channels" />} variant="outline" className="mt-3">
                Connect a channel
              </Button>
            </div>
          ) : (
            <ul className="space-y-1 px-3 pb-3">
              {home.channels.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <ChannelAvatar platform={c.platform} name={c.displayName} avatar={c.avatar} className="size-8" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.displayName}</span>
                  {c.status !== "active" ? <StatusBadge status={c.status} /> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}
