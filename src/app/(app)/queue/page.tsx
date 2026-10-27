import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { requireCtx } from "@/lib/session";
import { listChannels } from "@/lib/services/channels";
import { queueOverview } from "./queue-data";
import { QueueEditor } from "./queue-editor";

export const metadata: Metadata = { title: "Queue" };

export default function QueuePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <QueueContent />
    </Suspense>
  );
}

async function QueueContent() {
  const ctx = await requireCtx();
  const channels = await listChannels(ctx);
  const overview = await queueOverview(ctx, channels);

  return (
    <div>
      <PageHeader
        title="Queue"
        description={`Set weekly posting times for each account. "Add to queue" in the composer picks the next free time. Times are in ${ctx.timezone.replace("_", " ")}.`}
      />
      {channels.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Connect an account first, then set its posting times here."
          action={<Button render={<Link href="/channels" />}>Connect an account</Button>}
        />
      ) : (
        <div className="space-y-4">
          {channels.map((c) => (
            <QueueEditor
              key={c.id}
              channel={{ id: c.id, platform: c.platform, displayName: c.displayName, avatar: c.avatar, status: c.status, slots: c.slots }}
              otherChannelIds={channels.filter((o) => o.id !== c.id).map((o) => o.id)}
              overview={overview[c.id]}
              canEdit={can(ctx.role, "channel:manage")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
