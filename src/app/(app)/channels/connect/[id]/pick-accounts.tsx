"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChannelAvatar } from "@/components/platform-icon";
import { PLATFORM_INFO, type Platform } from "@/lib/platforms/catalog";
import { confirmConnectionAction } from "../../actions";

interface Candidate {
  key: string;
  platform: Platform;
  displayName: string;
  username?: string;
  avatar?: string;
  unavailableReason?: string;
  alreadyConnected: boolean;
}

export function PickAccounts({ pendingId, candidates }: { pendingId: string; candidates: Candidate[] }) {
  const [picked, setPicked] = useState<string[]>(candidates.filter((c) => !c.unavailableReason && !c.alreadyConnected).map((c) => c.key));
  const [pending, start] = useTransition();
  const available = candidates.filter((c) => !c.unavailableReason);

  return (
    <div className="max-w-xl space-y-4">
      <ul className="divide-y rounded-xl border">
        {candidates.map((c) => {
          const disabled = Boolean(c.unavailableReason);
          return (
            <li key={c.key}>
              <label className={`flex items-center gap-3 px-4 py-3 ${disabled ? "opacity-60" : "cursor-pointer hover:bg-muted/40"}`}>
                <input
                  type="checkbox"
                  className="size-4 accent-foreground"
                  disabled={disabled}
                  checked={picked.includes(c.key)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.key] : p.filter((k) => k !== c.key)))}
                />
                <ChannelAvatar platform={c.platform} name={c.displayName} avatar={c.avatar} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.displayName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {PLATFORM_INFO[c.platform].label}
                    {c.username ? ` · @${c.username}` : ""}
                    {c.alreadyConnected ? " · already connected (will refresh its login)" : ""}
                  </span>
                  {c.unavailableReason ? <span className="block text-xs text-amber-700">{c.unavailableReason}</span> : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:underline"
          onClick={() => setPicked(picked.length === available.length ? [] : available.map((c) => c.key))}
        >
          {picked.length === available.length ? "Select none" : "Select all"}
        </button>
        <Button
          disabled={pending || picked.length === 0}
          onClick={() =>
            start(async () => {
              const res = await confirmConnectionAction(pendingId, picked);
              if (res && !res.ok) toast.error(res.error.message);
            })
          }
        >
          {pending ? "Connecting…" : `Connect ${picked.length || ""}`}
        </Button>
      </div>
    </div>
  );
}
