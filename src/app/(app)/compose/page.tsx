import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/page-header";
import { isAppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { requireCtx } from "@/lib/session";
import { listChannels } from "@/lib/services/channels";
import { getPostGroup, type PostGroupView } from "@/lib/services/posts";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "New post" };

async function Content({ searchParams }: { searchParams: PageProps<"/compose">["searchParams"] }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const channels = await listChannels(ctx);

  let existing: PostGroupView | undefined;
  if (typeof sp.id === "string") {
    try {
      existing = await getPostGroup(ctx, sp.id);
    } catch (err) {
      if (isAppError(err) && err.status === 404) notFound();
      throw err;
    }
  }

  if (!can(ctx.role, "post:write")) {
    return <EmptyState title="You can view posts but not write them" description="Ask a workspace admin to change your role." />;
  }
  if (channels.length === 0) {
    return (
      <EmptyState
        title="Connect an account first"
        description="Add a Facebook Page, Instagram, LinkedIn, Telegram, Bluesky or Mastodon account to start posting."
        action={<Button render={<Link href="/channels" />}>Connect accounts</Button>}
      />
    );
  }
  const at = typeof sp.at === "string" && !Number.isNaN(Date.parse(sp.at)) ? sp.at : undefined;
  return (
    <Composer
      channels={channels}
      timezone={ctx.timezone}
      existing={existing}
      initialAt={at}
      canPublish={can(ctx.role, "post:publish")}
      preselect={typeof sp.channel === "string" ? sp.channel : undefined}
    />
  );
}

export default function ComposePage(props: PageProps<"/compose">) {
  return (
    <>
      <PageHeader title="Compose" description="Write once, adjust per platform, and send to every account at the same time." />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
