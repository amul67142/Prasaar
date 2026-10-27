import { Suspense } from "react";
import { requireCtx, requireUser } from "@/lib/session";
import { getWorkspace, listWorkspacesForUser } from "@/lib/services/team";
import { MobileBar, Sidebar } from "./sidebar";
import { UsageCard, UsageCardSkeleton } from "./usage-card";
import { WorkspaceMenu } from "./workspace-menu";

async function Account() {
  const [user, ctx] = await Promise.all([requireUser(), requireCtx()]);
  const [current, workspaces] = await Promise.all([getWorkspace(ctx), listWorkspacesForUser(user._id)]);
  return <WorkspaceMenu current={current} workspaces={workspaces} user={{ name: user.name, email: user.email }} />;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  const account = (
    <Suspense fallback={<div className="h-14 animate-pulse rounded-xl bg-muted/60" />}>
      <Account />
    </Suspense>
  );
  const usage = (
    <Suspense fallback={<UsageCardSkeleton />}>
      <UsageCard />
    </Suspense>
  );
  return (
    <div className="flex min-h-dvh bg-muted/30">
      <Sidebar account={account} usage={usage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar account={account} usage={usage} />
        <main className="mx-auto w-full max-w-[1040px] flex-1 px-4 py-8 sm:px-8 lg:py-12">{children}</main>
      </div>
    </div>
  );
}
