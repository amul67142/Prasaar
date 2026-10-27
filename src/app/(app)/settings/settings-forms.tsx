"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateProfileAction, updateWorkspaceAction } from "./actions";

interface Props {
  workspace: { name: string; timezone: string; plan: string };
  profile: { name: string; email: string; locale: string; notifyPostFailed: boolean; notifyTokenExpiring: boolean };
  canManageWorkspace: boolean;
  timezones: string[];
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-4 sm:p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function SettingsForms({ workspace, profile, canManageWorkspace, timezones }: Props) {
  const [ws, setWs] = useState({ name: workspace.name, timezone: workspace.timezone });
  const [me, setMe] = useState({ name: profile.name, locale: profile.locale });
  const [pending, start] = useTransition();

  const save = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success("Saved");
      else toast.error(res.error!.message);
    });

  return (
    <div className="max-w-2xl space-y-6">
      <Card title="Workspace" description={`Plan: ${workspace.plan}. Billing in rupees with GST invoices is coming soon.`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save(() => updateWorkspaceAction(ws));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Name</Label>
            <Input id="ws-name" value={ws.name} disabled={!canManageWorkspace} onChange={(e) => setWs({ ...ws, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-tz">Timezone</Label>
            <select
              id="ws-tz"
              value={ws.timezone}
              disabled={!canManageWorkspace}
              onChange={(e) => setWs({ ...ws, timezone: e.target.value })}
              className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace("_", " ")}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">The calendar, queue times and the composer all use this timezone.</p>
          </div>
          {canManageWorkspace ? (
            <Button type="submit" disabled={pending}>
              Save workspace
            </Button>
          ) : null}
        </form>
      </Card>

      <Card title="Your profile" description={profile.email}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save(() => updateProfileAction(me));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="me-name">Name</Label>
            <Input id="me-name" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="me-locale">Language</Label>
            <select id="me-locale" value={me.locale} onChange={(e) => setMe({ ...me, locale: e.target.value })} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi) — coming soon</option>
            </select>
          </div>
          <Button type="submit" disabled={pending}>
            Save profile
          </Button>
        </form>
      </Card>

      <Card title="Email alerts">
        <Toggle
          label="A post fails to publish"
          checked={profile.notifyPostFailed}
          onChange={(v) => save(() => updateProfileAction({ notifyPostFailed: v }))}
        />
        <Toggle
          label="An account's login is about to expire"
          checked={profile.notifyTokenExpiring}
          onChange={(v) => save(() => updateProfileAction({ notifyTokenExpiring: v }))}
        />
      </Card>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const [on, setOn] = useState(checked);
  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      {label}
      <Switch
        checked={on}
        onCheckedChange={(v) => {
          setOn(v);
          onChange(v);
        }}
      />
    </label>
  );
}
