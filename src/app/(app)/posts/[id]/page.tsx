import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { ChannelAvatar } from "@/components/platform-icon";
import { StatusBadge } from "@/components/status-badge";
import { isAppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { requireCtx } from "@/lib/session";
import { listChannels } from "@/lib/services/channels";
import { getPostGroup, getPostLogs } from "@/lib/services/posts";
import { formatInTz } from "@/lib/time";
import { MediaThumb } from "../../compose/media-strip";
import { PostActions, RetryButton } from "./post-actions";

export const metadata: Metadata = { title: "Post" };

async function Detail({ params }: { params: PageProps<"/posts/[id]">["params"] }) {
  const { id } = await params;
  const ctx = await requireCtx();
  let group;
  try {
    group = await getPostGroup(ctx, id);
  } catch (err) {
    if (isAppError(err) && err.status === 404) notFound();
    throw err;
  }
  const [channels, logs] = await Promise.all([listChannels(ctx), getPostLogs(ctx, id)]);
  const channelOf = new Map(channels.map((c) => [c.id, c]));
  const fmt = (iso?: string) => (iso ? formatInTz(iso, ctx.timezone, "EEE d MMM yyyy, h:mm a") : "—");
  const editable = ["draft", "scheduled", "failed"].includes(group.status) && !group.posts.some((p) => ["publishing", "published"].includes(p.status));
  const targets = group.posts.length
    ? group.posts
    : group.channelIds.map((cid) => ({ id: cid, channelId: cid, platform: channelOf.get(cid)?.platform, status: "draft" as const, attempts: 0 }));

  return (
    <>
      <PageHeader
        title={group.status === "draft" ? "Draft" : "Post"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={group.status} />
            {group.scheduledAt ? <span>{group.status === "draft" ? "Planned for" : "Scheduled for"} {fmt(group.scheduledAt)}</span> : null}
          </span>
        }
        actions={
          can(ctx.role, "post:write") ? (
            <PostActions id={group.id} editable={editable} status={group.status} />
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-xl border">
            <h2 className="border-b px-4 py-2.5 text-sm font-medium">Accounts</h2>
            <ul className="divide-y">
              {targets.map((p) => {
                const c = channelOf.get(p.channelId);
                return (
                  <li key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                    {c ? <ChannelAvatar platform={c.platform} name={c.displayName} avatar={c.avatar} /> : <span className="size-9 rounded-full bg-muted" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c?.displayName ?? "Disconnected account"}</p>
                      <p className="text-xs text-muted-foreground">
                        {"publishedAt" in p && p.publishedAt ? `Published ${fmt(p.publishedAt)}` : "scheduledAt" in p && p.scheduledAt ? fmt(p.scheduledAt) : null}
                        {p.attempts > 1 ? ` · ${p.attempts} attempts` : ""}
                      </p>
                      {"lastError" in p && p.lastError?.message ? <p className="mt-1 text-sm text-destructive">{p.lastError.message}</p> : null}
                      {"firstCommentStatus" in p && p.firstCommentStatus === "failed" ? (
                        <p className="mt-1 text-xs text-amber-700">The first comment couldn&apos;t be added.</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={p.status} />
                      {"permalink" in p && p.permalink ? (
                        <Button variant="ghost" size="icon-sm" render={<a href={p.permalink} target="_blank" rel="noreferrer" aria-label="Open live post" />}>
                          <ExternalLink />
                        </Button>
                      ) : null}
                      {p.status === "failed" && can(ctx.role, "post:publish") ? <RetryButton postId={p.id} /> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border">
            <h2 className="border-b px-4 py-2.5 text-sm font-medium">Publish log</h2>
            {logs.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Nothing yet. Entries appear when publishing starts.</p>
            ) : (
              <ul className="max-h-96 divide-y overflow-y-auto text-sm">
                {logs.map((l) => (
                  <li key={l.id} className="flex gap-3 px-4 py-2">
                    <span className="w-36 shrink-0 text-xs text-muted-foreground tabular-nums">{formatInTz(l.createdAt, ctx.timezone, "d MMM, HH:mm:ss")}</span>
                    <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{channelOf.get(group.posts.find((p) => p.id === l.postId)?.channelId ?? "")?.displayName ?? ""}</span>
                    <span className={l.level === "error" ? "text-destructive" : l.level === "warn" ? "text-amber-700" : ""}>{l.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-3">
          <section className="rounded-xl border p-4">
            <h2 className="mb-2 text-sm font-medium">Content</h2>
            <p className="text-sm break-words whitespace-pre-wrap">{group.content || <span className="text-muted-foreground">No text</span>}</p>
            {Object.entries(group.perPlatform).some(([, o]) => o?.content !== undefined) ? (
              <p className="mt-2 text-xs text-muted-foreground">Some platforms use custom text.</p>
            ) : null}
            {group.media.length ? (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {group.media.map((m) => (
                  <MediaThumb key={m.id} m={m} className="aspect-square" />
                ))}
              </div>
            ) : null}
            {group.firstComment ? (
              <div className="mt-3 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">First comment</p>
                <p className="text-sm whitespace-pre-wrap">{group.firstComment}</p>
              </div>
            ) : null}
          </section>
          <Link href="/calendar" className="block text-sm text-muted-foreground hover:underline">
            ← Back to calendar
          </Link>
        </aside>
      </div>
    </>
  );
}

export default function PostPage(props: PageProps<"/posts/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Detail params={props.params} />
    </Suspense>
  );
}
