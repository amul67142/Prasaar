import { cn } from "@/lib/utils";

const STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-zinc-100 text-zinc-700" },
  pending_approval: { label: "Awaiting approval", className: "bg-amber-100 text-amber-800" },
  scheduled: { label: "Scheduled", className: "bg-sky-100 text-sky-800" },
  publishing: { label: "Publishing", className: "bg-violet-100 text-violet-800" },
  retrying: { label: "Retrying", className: "bg-amber-100 text-amber-800" },
  published: { label: "Published", className: "bg-emerald-100 text-emerald-800" },
  partially_published: { label: "Partly published", className: "bg-orange-100 text-orange-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
  cancelled: { label: "Cancelled", className: "bg-zinc-100 text-zinc-500" },
  active: { label: "Connected", className: "bg-emerald-100 text-emerald-800" },
  expired: { label: "Reconnect", className: "bg-red-100 text-red-800" },
  revoked: { label: "Revoked", className: "bg-red-100 text-red-800" },
};

/** Calendar chip colours, keyed like STYLES. */
export const STATUS_DOT: Record<string, string> = {
  draft: "bg-zinc-400",
  pending_approval: "bg-amber-500",
  scheduled: "bg-sky-500",
  publishing: "bg-violet-500",
  published: "bg-emerald-500",
  partially_published: "bg-orange-500",
  failed: "bg-red-500",
};

export function statusLabel(status: string) {
  return STYLES[status]?.label ?? status;
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STYLES[status] ?? { label: status, className: "bg-zinc-100 text-zinc-700" };
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap", s.className, className)}>
      {s.label}
    </span>
  );
}
