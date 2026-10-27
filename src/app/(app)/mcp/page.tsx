import type { Metadata } from "next";
import { Bot, ChevronRight, Code2, MessageSquare, MousePointerClick, Plug, SquareTerminal, Wind } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "MCP" };

const CLIENTS = [
  { name: "Claude", detail: "Web and desktop", icon: MessageSquare },
  { name: "Claude Code", detail: "Terminal", icon: SquareTerminal },
  { name: "ChatGPT / Codex", detail: "Web, desktop and terminal", icon: Bot },
  { name: "Cursor", detail: "Editor", icon: MousePointerClick },
  { name: "VS Code", detail: "Editor", icon: Code2 },
  { name: "Windsurf", detail: "Editor", icon: Wind },
  { name: "Other MCP client", detail: "Any app that speaks MCP", icon: Plug },
];

const PROMPTS = [
  { text: "Schedule this on LinkedIn tomorrow at 9 am", detail: "Create and schedule posts" },
  { text: "What's going out this week?", detail: "Check your calendar" },
  { text: "Move Friday's Instagram post to Saturday evening", detail: "Reschedule posts" },
  { text: "Which posts failed and why?", detail: "Find and fix problems" },
];

// Phase 2 preview: the MCP server isn't live yet.
export default function McpPage() {
  return (
    <>
      <PageHeader title="Connect your AI assistant" description="Let Claude, Cursor and other assistants schedule posts for you." />
      <div className="space-y-6">
        <section>
          <div className="grid gap-3 sm:grid-cols-2">
            {CLIENTS.map(({ name, detail, icon: Icon }) => (
              <div key={name} className="flex items-center gap-4 rounded-2xl border bg-background p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{name}</span>
                  <span className="block text-sm text-muted-foreground">{detail}</span>
                </span>
                <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">Coming soon</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-background p-6">
          <h2 className="text-lg font-semibold">Connections</h2>
          <p className="mt-3 text-[15px] text-muted-foreground">No connections yet.</p>
        </section>

        <section className="rounded-2xl border bg-background p-6">
          <h2 className="text-lg font-semibold">What you can do</h2>
          <p className="mt-1 mb-5 text-[15px] text-muted-foreground">Ask in plain words. Your assistant checks with you before anything is published.</p>
          <ul className="space-y-3">
            {PROMPTS.map((p) => (
              <li key={p.text} className="rounded-xl border p-4">
                <p className="text-[15px] font-medium italic">&ldquo;{p.text}&rdquo;</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
