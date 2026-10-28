import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { requireCtx } from "@/lib/session";
import { listChannels } from "@/lib/services/channels";
import { getUsage } from "@/lib/services/usage";
import { formatInTz } from "@/lib/time";
import { ChannelRow, ConnectButton, Flash, PlatformStrip } from "./channels-client";

export const metadata: Metadata = { title: "Channels" };

async function Content({ searchParams }: { searchParams: PageProps<"/channels">["searchParams"] }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const [channels, usage] = await Promise.all([listChannels(ctx), getUsage(ctx)]);
  const manage = can(ctx.role, "channel:manage");
  const counts = channels.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.platform]: (acc[c.platform] ?? 0) + 1 }), {});

  return (
    <>
      <PageHeader title="Channels" description="Manage your connected social media channels" actions={manage ? <ConnectButton /> : null} />
      <Flash error={typeof sp.error === "string" ? sp.error : undefined} connected={typeof sp.connected === "string" ? sp.connected : undefined} />
      <PlatformStrip counts={counts} manage={manage} />

      <div className="mt-8 mb-3 flex items-center justify-between">
        <p className="font-medium">
          {usage.channels}/{usage.channelsLimit} channels used across workspace
        </p>
        <Link href="/settings#plan" className="text-sm font-medium text-brand hover:underline">
          Upgrade
        </Link>
      </div>

      {channels.length === 0 ? (
        <div className="rounded-2xl border bg-background">
          <EmptyState
            icon={<Link2 />}
            title="No channels yet"
            description="Connect a Facebook Page, Instagram, LinkedIn, YouTube, Telegram, Bluesky or Mastodon account to start posting."
            action={manage ? <ConnectButton /> : undefined}
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {channels.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              manage={manage}
              expiresLabel={c.tokenExpiresAt ? formatInTz(c.tokenExpiresAt, ctx.timezone, "d MMM yyyy") : undefined}
            />
          ))}
        </ul>
      )}
    </>
  );
}

export default function ChannelsPage(props: PageProps<"/channels">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
