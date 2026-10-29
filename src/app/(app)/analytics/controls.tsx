"use client";

import { useTransition } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { refreshAnalyticsAction } from "./actions";

export function RangeTabs({ value, options }: { value: number; options: readonly number[] }) {
  return (
    <div className="flex rounded-xl border p-0.5" role="tablist" aria-label="Date range">
      {options.map((d) => (
        <Link
          key={d}
          href={`/analytics?range=${d}`}
          role="tab"
          aria-selected={value === d}
          scroll={false}
          className={cn("rounded-lg px-3 py-1.5 text-sm", value === d ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:text-foreground")}
        >
          {d} days
        </Link>
      ))}
    </div>
  );
}

export function RefreshButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      className="h-10 rounded-xl"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await refreshAnalyticsAction();
          if (!res.ok) return void toast.error(res.error.message);
          const r = res.data;
          toast.success(
            r.errors
              ? `Updated ${r.channels - r.errors} of ${r.channels} channels. See the notes below for the rest.`
              : `Stats updated for ${r.channels} channel${r.channels === 1 ? "" : "s"}.`,
          );
        })
      }
    >
      <RefreshCw className={cn(pending && "animate-spin")} />
      {pending ? "Refreshing…" : "Refresh stats"}
    </Button>
  );
}
