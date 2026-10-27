"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { changeRoleAction, inviteAction, removeMemberAction, revokeInviteAction } from "./actions";

const ROLE_HELP: Record<Exclude<Role, "owner">, string> = {
  admin: "Everything, including accounts and team",
  editor: "Write, schedule and publish posts; upload media",
  approver: "View posts and approve them (approvals arrive soon)",
  viewer: "View the calendar and posts",
};

interface Props {
  members: { id: string; userId: string; name: string; email: string; role: Role }[];
  invites: { id: string; email: string; role: Role; expiresAt: string }[];
  me: string;
  myRole: Role;
  canManage: boolean;
}

export function TeamClient({ members, invites, me, myRole, canManage }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [pending, start] = useTransition();
  const assignable = (Object.keys(ROLE_HELP) as Exclude<Role, "owner">[]).filter((r) => r !== "admin" || myRole === "owner");

  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>, success: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(success);
      else toast.error(res.error!.message);
    });

  return (
    <div className="max-w-3xl space-y-8">
      {canManage ? (
        <form
          className="flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await inviteAction(email, role);
              if (res.ok) setEmail("");
              return res;
            }, `Invite sent to ${email}`);
          }}
        >
          <div className="flex-1 space-y-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium">Invite by email</label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@agency.in" required />
          </div>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-8 rounded-lg border bg-background px-2 text-sm" aria-label="Role">
            {assignable.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={pending}>
            Send invite
          </Button>
        </form>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-medium">Members</h2>
        <ul className="divide-y rounded-xl border">
          {members.map((m) => {
            const self = m.userId === me;
            const editable = canManage && m.role !== "owner" && !self && (myRole === "owner" || m.role !== "admin");
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-medium">{m.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name} {self ? <span className="font-normal text-muted-foreground">(you)</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                {editable ? (
                  <select
                    value={m.role}
                    disabled={pending}
                    onChange={(e) => run(() => changeRoleAction(m.id, e.target.value as Role), "Role updated")}
                    className="h-8 rounded-lg border bg-background px-2 text-sm"
                    aria-label={`Role for ${m.name}`}
                  >
                    {assignable.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-muted-foreground">{ROLE_LABELS[m.role]}</span>
                )}
                {editable || (self && m.role !== "owner") ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(self ? "Leave this workspace?" : `Remove ${m.name} from this workspace?`)) {
                        run(() => removeMemberAction(m.id, self), self ? "You left the workspace" : "Member removed");
                      }
                    }}
                  >
                    {self ? "Leave" : "Remove"}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {invites.length ? (
        <section>
          <h2 className="mb-3 text-sm font-medium">Pending invites</h2>
          <ul className="divide-y rounded-xl border">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{i.email}</span>
                <span className="text-muted-foreground">{ROLE_LABELS[i.role]}</span>
                {canManage ? (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => revokeInviteAction(i.id), "Invite cancelled")}>
                    Cancel
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl bg-muted/40 p-4 text-sm">
        <p className="mb-2 font-medium">Roles</p>
        <ul className="space-y-1 text-muted-foreground">
          <li><span className="text-foreground">Owner</span> — everything, and can manage admins</li>
          {(Object.keys(ROLE_HELP) as Exclude<Role, "owner">[]).map((r) => (
            <li key={r}>
              <span className="text-foreground">{ROLE_LABELS[r]}</span> — {ROLE_HELP[r]}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
