"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkspaceAction } from "../../(app)/shell-actions";

// Reached when a user belongs to no workspace (for example, after being removed from their only one).
export default function OnboardingPage() {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="rounded-2xl border bg-background p-7 shadow-[0_8px_30px_rgb(0,0,0,0.06)] sm:p-12">
      <h1 className="font-display text-3xl font-bold">Create a workspace</h1>
      <p className="mb-5 text-sm text-muted-foreground">A workspace holds one brand&apos;s accounts, posts and team.</p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await createWorkspaceAction(name);
            if (res && !res.ok) toast.error(res.error.message);
          });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">Workspace name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending || !name.trim()}>
          Create workspace
        </Button>
      </form>
    </div>
  );
}
