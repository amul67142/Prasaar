"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Clock, Code2, House, Images, LayoutGrid, Link2, Send, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon };

export const NAV_GROUPS: Item[][] = [
  [
    { href: "/home", label: "Home", icon: House },
    { href: "/channels", label: "Channels", icon: Link2 },
    { href: "/posts", label: "Posts", icon: Send },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
  ],
  [
    { href: "/media", label: "Media", icon: Images },
    { href: "/queue", label: "Queue", icon: Clock },
  ],
  [
    { href: "/api-keys", label: "API", icon: Code2 },
    { href: "/mcp", label: "MCP", icon: LayoutGrid },
  ],
];

export function Nav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return <NavLinks pathname={usePathname()} collapsed={collapsed} onNavigate={onNavigate} />;
}

/** Same links without the active highlight; shown until the pathname is known. */
export function NavLinks({ pathname, collapsed, onNavigate }: { pathname?: string; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-6">
      {NAV_GROUPS.map((group, i) => (
        <div key={i} className="flex flex-col gap-1">
          {group.map(({ href, label, icon: Icon }) => {
            const active = pathname !== undefined && (pathname === href || pathname.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                title={collapsed ? label : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors",
                  collapsed && "justify-center px-0",
                  active ? "bg-muted font-medium text-foreground" : "text-foreground/75 hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                {collapsed ? <span className="sr-only">{label}</span> : label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
