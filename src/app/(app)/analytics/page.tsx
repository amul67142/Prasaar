import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, BarChart3, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/page-header";
import { ChannelAvatar, PlatformIcon } from "@/components/platform-icon";
import { cn } from "@/lib/utils";
import { requireCtx } from "@/lib/session";
import { ANALYTICS_RANGES, getAnalytics, METRICS_WINDOW_DAYS, type AnalyticsRange, type AnalyticsView } from "@/lib/services/analytics";
import { ANALYTICS_SUPPORT, METRIC_LABELS, type MetricKey } from "@/lib/platforms/analytics-info";
import { PLATFORM_INFO } from "@/lib/platforms/catalog";
import { formatInTz } from "@/lib/time";
import { RangeTabs, RefreshButton } from "./controls";
import { FollowersChart } from "./followers-chart";

export const metadata: Metadata = { title: "Analytics" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const fmt = (n: number) => n.toLocaleString("en-IN");

/** "in 30 days", or "since 9 Oct" when the first reading came later than the range start. */
function sinceLabel(firstDay: string | undefined, range: number) {
  if (!firstDay) return `in ${range} days`;
  const daysCovered = Math.round((Date.now() - Date.parse(`${firstDay}T00:00:00Z`)) / 86_400_000);
  return daysCovered >= range - 1 ? `in ${range} days` : `since ${formatInTz(`${firstDay}T12:00:00Z`, "UTC", "d MMM")}`;
}

export default function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const asked = Number(Array.isArray(sp.range) ? sp.range[0] : sp.range);
  const range: AnalyticsRange = (ANALYTICS_RANGES as readonly number[]).includes(asked) ? (asked as AnalyticsRange) : 30;
  const ctx = await requireCtx();
  const data = await getAnalytics(ctx, range);

  const updated = data.lastCollectedAt ? formatInTz(data.lastCollectedAt, ctx.timezone, "d MMM, h:mm a") : undefined;
  const header = (
    <PageHeader
      title="Analytics"
      description={
        <>
          Posts published in the last {range} days.{" "}
          {updated ? `Numbers last read from the platforms ${updated}; they update every morning.` : "Numbers are read from the platforms every morning."}
        </>
      }
      actions={
        <>
          <RangeTabs value={range} options={ANALYTICS_RANGES} />
          {data.channels.length ? <RefreshButton /> : null}
        </>
      }
    />
  );

  if (data.channels.length === 0) {
    return (
      <>
        {header}
        <div className="rounded-2xl border bg-background">
          <EmptyState
            icon={<BarChart3 />}
            title="No channels yet"
            description="Connect a channel and publish a post to see how it performs."
            action={<Button render={<Link href="/channels" />}>Connect a channel</Button>}
          />
        </div>
      </>
    );
  }

  const t = data.totals;
  const p = data.previous;
  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Posts published" value={t.posts} delta={t.posts - p.posts} range={range} />
        <Tile label="Engagement" hint="Likes, comments, shares and saves" value={t.engagement} delta={p.posts ? t.engagement - p.engagement : undefined} range={range} />
        <Tile label="Views" hint="Instagram and YouTube" value={t.views} delta={p.posts ? t.views - p.views : undefined} range={range} />
        <Tile
          label="Followers"
          hint="All channels, now"
          value={data.followersNow}
          delta={data.followersChange}
          deltaLabel={sinceLabel(data.followersSince, range)}
          empty="Counted from tomorrow"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 rounded-2xl border bg-background p-5">
          <h2 className="font-semibold">Followers</h2>
          <p className="mb-4 text-sm text-muted-foreground">Total across all channels, one reading a day.</p>
          {data.followers.length >= 2 ? (
            <>
              <FollowersChart points={data.followers} />
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show as table</summary>
                <table className="mt-2 w-full max-w-sm text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 font-normal">Day</th>
                      <th className="py-1 text-right font-normal">Followers</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {data.followers.map((f) => (
                      <tr key={f.day} className="border-t">
                        <td className="py-1">{formatInTz(`${f.day}T12:00:00Z`, "UTC", "d MMM yyyy")}</td>
                        <td className="py-1 text-right">{fmt(f.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="rounded-xl bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
              {data.followers.length === 1
                ? `${fmt(data.followers[0].value)} followers today. The trend line appears after the second daily reading.`
                : "Follower counts are read once a day. Use Refresh stats to take the first reading now."}
            </p>
          )}
        </section>

        <section className="rounded-2xl border bg-background p-5">
          <h2 className="font-semibold">Breakdown</h2>
          <p className="mb-3 text-sm text-muted-foreground">Last {range} days, all channels.</p>
          <dl className="divide-y text-[15px]">
            {(["likes", "comments", "shares", "saves", "reach"] as MetricKey[]).map((k) => (
              <div key={k} className="flex items-center justify-between py-2.5">
                <dt className="text-muted-foreground">{METRIC_LABELS[k]}</dt>
                <dd className="font-medium tabular-nums">{fmt(t[k])}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">Reach and saves come from Instagram only.</p>
        </section>
      </div>

      <TopPosts data={data} tz={ctx.timezone} />
      <Channels data={data} range={range} />

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Each post&apos;s numbers keep updating for {METRICS_WINDOW_DAYS} days after it&apos;s published, then stay as they are. Platforms can take up to two days to settle their counts.
      </p>
    </>
  );
}

function Tile({
  label,
  hint,
  value,
  delta,
  range,
  deltaLabel,
  empty,
}: {
  label: string;
  hint?: string;
  value?: number;
  delta?: number;
  range?: number;
  deltaLabel?: string;
  empty?: string;
}) {
  return (
    <div className="rounded-2xl border bg-background p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      {value == null ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty ?? "No data yet"}</p>
      ) : (
        <p className="mt-2 font-display text-3xl font-bold">{fmt(value)}</p>
      )}
      <div className="mt-1 min-h-5 text-xs">
        {delta != null && delta !== 0 ? (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", delta > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
            {delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {delta > 0 ? "+" : "−"}
            {fmt(Math.abs(delta))}
            <span className="font-normal text-muted-foreground">&nbsp;{deltaLabel ?? `vs previous ${range} days`}</span>
          </span>
        ) : hint ? (
          <span className="text-muted-foreground">{hint}</span>
        ) : null}
      </div>
    </div>
  );
}

function TopPosts({ data, tz }: { data: AnalyticsView; tz: string }) {
  const cols: MetricKey[] = ["likes", "comments", "shares", "views"];
  return (
    <section className="mt-6 rounded-2xl border bg-background">
      <div className="px-5 pt-5 pb-3">
        <h2 className="font-semibold">Top posts</h2>
        <p className="text-sm text-muted-foreground">Ranked by engagement, then views.</p>
      </div>
      {data.topPosts.length === 0 ? (
        <p className="px-5 pb-6 text-[15px] text-muted-foreground">
          {data.totals.posts ? "Numbers for these posts haven't been read yet. Try Refresh stats." : `Nothing published in the last ${data.range} days.`}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-[44%] px-5 py-2 font-normal">Post</th>
                {cols.map((k) => (
                  <th key={k} className="px-3 py-2 text-right font-normal">
                    {METRIC_LABELS[k]}
                  </th>
                ))}
                <th className="py-2 pr-5 pl-3 text-right font-normal">Engagement</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.topPosts.map((p) => (
                <tr key={p.postId} className="align-top hover:bg-muted/30">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <PlatformIcon platform={p.platform} size="xs" />
                      <span className="truncate">{p.channelName}</span>
                      <span>·</span>
                      <span className="shrink-0">{formatInTz(p.publishedAt, tz, "d MMM")}</span>
                      {p.permalink ? (
                        <a href={p.permalink} target="_blank" rel="noreferrer" className="shrink-0 hover:text-foreground" aria-label={`Open on ${PLATFORM_INFO[p.platform].label}`}>
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                    </div>
                    <Link href={`/posts/${p.groupId}`} className="mt-1 line-clamp-2 text-[15px] hover:underline">
                      {p.snippet || <span className="text-muted-foreground">Media only</span>}
                    </Link>
                  </td>
                  {cols.map((k) => (
                    <td key={k} className="px-3 py-3 text-right tabular-nums">
                      {p.metrics[k] != null ? fmt(p.metrics[k]!) : <span className="text-muted-foreground">–</span>}
                    </td>
                  ))}
                  <td className="py-3 pr-5 pl-3 text-right font-semibold tabular-nums">{fmt(p.engagement)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Channels({ data, range }: { data: AnalyticsView; range: number }) {
  return (
    <section className="mt-6 rounded-2xl border bg-background">
      <div className="px-5 pt-5 pb-3">
        <h2 className="font-semibold">Channels</h2>
        <p className="text-sm text-muted-foreground">What each platform shares, and how each account did.</p>
      </div>
      <ul className="divide-y">
        {data.channels.map((c) => {
          const support = ANALYTICS_SUPPORT[c.platform];
          return (
            <li key={c.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <ChannelAvatar platform={c.platform} name={c.displayName} avatar={c.avatar} className="size-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {support.metrics.length ? `Tracks ${support.metrics.map((m) => METRIC_LABELS[m].toLowerCase()).join(", ")}` : "No post stats"}
                  {support.note ? `. ${support.note}` : ""}
                </p>
                {c.note ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{c.note}</p> : null}
              </div>
              <dl className="grid grid-cols-3 gap-6 text-right text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">{support.followers ?? "Followers"}</dt>
                  <dd className="font-medium tabular-nums">{c.followers != null ? fmt(c.followers) : "–"}</dd>
                  {c.followersChange ? (
                    <dd className={cn("text-xs tabular-nums", c.followersChange > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                      {c.followersChange > 0 ? "+" : "−"}
                      {fmt(Math.abs(c.followersChange))}
                    </dd>
                  ) : null}
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Posts ({range}d)</dt>
                  <dd className="font-medium tabular-nums">{fmt(c.posts)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Engagement</dt>
                  <dd className="font-medium tabular-nums">{support.metrics.length ? fmt(c.engagement) : "–"}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
