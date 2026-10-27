"use client";

import { Suspense, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Plus, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { EchoMonogram, Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Nav, NavLinks } from "./nav";

const noop = () => () => {};
/** False during SSR and hydration, true after: keeps theme-dependent UI out of the server HTML. */
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted/70 p-0.5">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-label={`${label} theme`}
          aria-pressed={mounted && theme === value}
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground",
            mounted && theme === value && "bg-background text-foreground shadow-xs",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

function SidebarBody({
  collapsed,
  onToggle,
  account,
  usage,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  account: ReactNode;
  usage: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-5">
      <div className={cn("flex items-center justify-between gap-2 px-1 pt-1", collapsed && "flex-col")}>
        <Link href="/home" onClick={onNavigate} aria-label="Prasaar home">
          {collapsed ? <EchoMonogram /> : <Logo className="text-[28px]" />}
        </Link>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          </button>
        ) : null}
      </div>

      <Button
        render={<Link href="/compose" onClick={onNavigate} />}
        className={cn("h-11 rounded-xl text-[15px]", collapsed ? "w-11 self-center px-0" : "w-full")}
        aria-label="New Draft"
      >
        <Plus className="size-4" />
        {collapsed ? null : "New Draft"}
      </Button>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Suspense fallback={<NavLinks collapsed={collapsed} onNavigate={onNavigate} />}>
          <Nav collapsed={collapsed} onNavigate={onNavigate} />
        </Suspense>
      </div>

      {collapsed ? null : (
        <div className="space-y-4">
          {usage}
          {account}
        </div>
      )}
      <div className={cn("flex items-center justify-between border-t pt-3", collapsed && "flex-col gap-2")}>
        {collapsed ? null : <ThemeSwitch />}
        <Link
          href="/#faq"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Help and docs"
          title="Help and docs"
        >
          <BookOpen className="size-4" />
        </Link>
      </div>
    </div>
  );
}

export function Sidebar({ account, usage }: { account: ReactNode; usage: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 border-r bg-background p-3 transition-[width] duration-200 lg:block",
        collapsed ? "w-[76px]" : "w-[272px]",
      )}
    >
      <SidebarBody collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} account={account} usage={usage} />
    </aside>
  );
}

export function MobileBar({ account, usage }: { account: ReactNode; usage: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/90 px-4 py-2.5 backdrop-blur lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-[288px] p-3">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarBody collapsed={false} account={account} usage={usage} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <Link href="/home" aria-label="Prasaar home">
        <Logo className="text-[24px]" />
      </Link>
    </header>
  );
}
