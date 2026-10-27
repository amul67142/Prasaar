import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CodeExamples } from "./code-examples";

export const metadata: Metadata = { title: "API" };

// Phase 2 preview: the page shows what's coming; no keys can be created yet.
export default function ApiKeysPage() {
  return (
    <>
      <PageHeader title="API" description="Create keys to post from your own scripts and tools." />
      <div className="space-y-6">
        <section className="rounded-2xl border bg-background p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">API keys</h2>
              <p className="mt-1 text-[15px] text-muted-foreground">Each key works for this workspace. You&apos;ll see a key once, when you create it.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">Coming soon</span>
              <Button disabled>
                <Plus /> Create key
              </Button>
            </div>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <thead>
                <tr className="border-b text-sm text-muted-foreground">
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Prefix</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium">Last used</th>
                  <th className="pb-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No keys yet
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border bg-background p-6">
          <h2 className="text-lg font-semibold">Code examples</h2>
          <p className="mt-1 mb-5 text-[15px] text-muted-foreground">
            Schedule a post with one request. Replace <code className="rounded bg-muted px-1 py-0.5 text-sm">pk_live_YOUR_KEY</code> with your key and{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-sm">ch_123</code> with a channel ID.
          </p>
          <CodeExamples />
          <p className="mt-4 text-sm text-muted-foreground">The API launches in our next release. The endpoint and fields shown here may still change.</p>
        </section>
      </div>
    </>
  );
}
