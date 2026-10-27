import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { requireCtx } from "@/lib/session";
import { listMembers } from "@/lib/services/team";
import { TeamClient } from "./team-client";

export const metadata: Metadata = { title: "Team" };

async function Content() {
  const ctx = await requireCtx();
  const { members, invites } = await listMembers(ctx);
  return <TeamClient members={members} invites={invites} me={ctx.userId.toString()} myRole={ctx.role} canManage={can(ctx.role, "team:manage")} />;
}

export default function TeamPage() {
  return (
    <>
      <PageHeader title="Team" description="Invite people to this workspace and choose what they can do." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}
