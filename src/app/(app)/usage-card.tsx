import Link from "next/link";
import { requireCtx } from "@/lib/session";
import { getUsage } from "@/lib/services/usage";

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : Math.min(100, used * 4);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {used} / {limit ?? "∞"}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(pct, used > 0 ? 6 : 0)}%` }} />
      </div>
    </div>
  );
}

export async function UsageCard() {
  const usage = await getUsage(await requireCtx());
  return (
    <div className="space-y-3 rounded-2xl bg-muted/60 p-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{usage.plan}</span>
        <Link href="/settings#plan" className="text-sm font-medium text-brand hover:underline">
          Upgrade
        </Link>
      </div>
      <Meter label="Monthly posts" used={usage.posts} limit={usage.postsLimit} />
      <Meter label="Channels" used={usage.channels} limit={usage.channelsLimit} />
    </div>
  );
}

export function UsageCardSkeleton() {
  return <div className="h-[132px] animate-pulse rounded-2xl bg-muted/60" />;
}
