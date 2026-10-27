import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, FileText, Inbox, TriangleAlert } from "lucide-react";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { requireCtx } from "@/lib/session";
import { listChannels } from "@/lib/services/channels";
import { countPostTabs, listPostGroups, POST_TABS, type PostTab } from "@/lib/services/post-lists";
import { formatInTz } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ChannelFilter } from "./channel-filter";

export const metadata: Metadata = { title: "Posts" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const TAB_LABELS: Record<PostTab, string> = {
  drafts: "Drafts",
  scheduled: "Scheduled",
  failed: "Failed",
  published: "Published",
};

const EMPTY: Record<PostTab, { icon: React.ReactNode; title: string; body: string }> = {
  drafts: { icon: <FileText />, title: "No drafts", body: "Posts you save without a time show up here" },
  scheduled: { icon: <Inbox />, title: "No scheduled posts", body: "Schedule your posts to publish them later" },
  failed: { icon: <TriangleAlert />, title: "No failed posts", body: "Anything that couldn't be published shows up here, with the reason" },
  published: { icon: <CalendarClock />, title: "Nothing published yet", body: "Posts appear here once they go live" },
};

function postsHref(p: { tab: PostTab; channel?: string; before?: string }) {
  const q = new URLSearchParams({ tab: p.tab });
  if (p.channel) q.set("channel", p.channel);
  if (p.before) q.set("before", p.before);
  return `/posts?${q.toString()}`;
}

export default function PostsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader title="Posts" description="Manage your posts" />
      <Suspense fallback={<PageSkeleton />}>
        <PostsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PostsContent({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const tabRaw = one(sp.tab);
  const tab: PostTab = POST_TABS.includes(tabRaw as PostTab) ? (tabRaw as PostTab) : "scheduled";
  const before = one(sp.before);
  const channelRaw = one(sp.channel) || undefined;

  const channels = await listChannels(ctx);
  const channel = channels.some((c) => c.id === channelRaw) ? channelRaw : undefined;
  const [{ items, nextCursor }, counts] = await Promise.all([
    listPostGroups(ctx, { tab, before, channelId: channel }),
    countPostTabs(ctx, { channelId: channel }),
  ]);
  const timeLabel = tab === "drafts" ? "Edited" : tab === "failed" ? "Updated" : null;
  const empty = EMPTY[tab];

  return (
    <div>
      <div className="mb-6 flex flex-col-reverse gap-3 border-b sm:flex-row sm:items-end sm:justify-between">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Post status">
          {POST_TABS.map((t) => (
            <Link
              key={t}
              href={postsHref({ tab: t, channel })}
              aria-current={t === tab ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 border-b-2 pb-3 text-[16px] whitespace-nowrap transition-colors",
                t === tab ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABELS[t]}
              <span
                className={cn(
                  "min-w-6 rounded-md px-1.5 py-0.5 text-center text-xs tabular-nums",
                  t === tab ? "bg-brand-soft text-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {counts[t]}
              </span>
            </Link>
          ))}
        </nav>
        <div className="pb-3">
          <ChannelFilter
            channels={channels.map((c) => ({ id: c.id, displayName: c.displayName, platform: c.platform }))}
            current={channel}
            hrefFor={Object.fromEntries([["", postsHref({ tab })], ...channels.map((c) => [c.id, postsHref({ tab, channel: c.id })])])}
          />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={empty.icon}
          title={before ? "No more posts" : empty.title}
          description={before ? undefined : empty.body}
          action={
            !before && tab !== "failed" && can(ctx.role, "post:write") ? (
              <Button variant="outline" render={<Link href="/compose" />}>
                New Draft
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-background">
          {items.map((p) => (
            <li key={p.id}>
              <Link href={`/posts/${p.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40">
                {p.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- CDN thumbnails
                  <img src={p.thumb} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileText className="size-5" strokeWidth={1.5} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px]">{p.snippet || <span className="text-muted-foreground">Media post</span>}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
                    <span className="flex -space-x-1">
                      {p.platforms.map((pl) => (
                        <PlatformIcon key={pl} platform={pl} size="sm" className="ring-2 ring-background" />
                      ))}
                    </span>
                    <span>
                      {p.channelCount} channel{p.channelCount === 1 ? "" : "s"}
                    </span>
                    {p.at ? (
                      <span className="tabular-nums">
                        {timeLabel ? `${timeLabel} ` : ""}
                        {formatInTz(p.at, ctx.timezone, "EEE d MMM yyyy, h:mm a")}
                      </span>
                    ) : null}
                  </div>
                </div>
                <StatusBadge status={p.status} className="shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {before || nextCursor ? (
        <div className="mt-5 flex items-center justify-between text-sm">
          {before ? (
            <Link href={postsHref({ tab, channel })} className="text-muted-foreground hover:text-foreground">
              ← Back to the start
            </Link>
          ) : (
            <span />
          )}
          {nextCursor ? (
            <Button variant="outline" className="rounded-xl" render={<Link href={postsHref({ tab, channel, before: nextCursor })} />}>
              Load more
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
