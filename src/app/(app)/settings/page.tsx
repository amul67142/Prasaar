import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { planLimits } from "@/lib/plans";
import { requireCtx, requireUser } from "@/lib/session";
import { getWorkspace } from "@/lib/services/team";
import { TIMEZONES } from "@/lib/time";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

async function Content() {
  const [ctx, user] = await Promise.all([requireCtx(), requireUser()]);
  const workspace = await getWorkspace(ctx);
  return (
    <SettingsForms
      workspace={{ name: workspace.name, timezone: workspace.timezone, plan: planLimits(workspace.planId).name }}
      profile={{
        name: user.name,
        email: user.email,
        locale: user.locale ?? "en",
        notifyPostFailed: user.notify?.postFailed !== false,
        notifyTokenExpiring: user.notify?.tokenExpiring !== false,
      }}
      canManageWorkspace={can(ctx.role, "workspace:manage")}
      timezones={TIMEZONES}
    />
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}
