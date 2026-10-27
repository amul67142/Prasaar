import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/page-header";
import { isAppError } from "@/lib/errors";
import { requireCtx } from "@/lib/session";
import { getPendingConnection } from "@/lib/services/channels";
import { PickAccounts } from "./pick-accounts";

export const metadata: Metadata = { title: "Choose accounts" };

async function load(id: string) {
  const ctx = await requireCtx();
  try {
    return { pending: await getPendingConnection(ctx, id) };
  } catch (err) {
    if (!isAppError(err)) throw err;
    return { error: err.message };
  }
}

async function Content({ params }: { params: PageProps<"/channels/connect/[id]">["params"] }) {
  const { id } = await params;
  const { pending, error } = await load(id);
  const back = <Link href="/channels" className="text-sm underline">Back to accounts</Link>;
  if (!pending) return <EmptyState title="This connection expired" description={error} action={back} />;
  if (pending.candidates.length === 0) {
    return (
      <EmptyState
        title="No accounts found"
        description="We couldn't find any Pages or profiles you manage with that login. Check you granted access to them, then try again."
        action={back}
      />
    );
  }
  return <PickAccounts pendingId={id} candidates={pending.candidates} />;
}

export default function ConnectPickPage(props: PageProps<"/channels/connect/[id]">) {
  return (
    <>
      <PageHeader title="Choose accounts to add" description="Only the accounts you tick are connected to this workspace." />
      <Suspense fallback={<PageSkeleton />}>
        <Content params={props.params} />
      </Suspense>
    </>
  );
}
