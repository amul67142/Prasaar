"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, LogOut, Plus, Settings, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkspaceAction, signOutAction, switchWorkspaceAction } from "./shell-actions";

interface Props {
  current: { id: string; name: string };
  workspaces: { id: string; name: string; role: string }[];
  user: { name: string; email: string };
}

/** Bottom-of-sidebar account block: workspace + email, opening workspace switching and account links. */
export function WorkspaceMenu({ current, workspaces, user }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-muted/60">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{current.name}</span>
                <span className="block truncate text-sm text-muted-foreground">{user.email}</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          }
        />
        <DropdownMenuContent side="top" align="start" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem key={w.id} onClick={() => w.id !== current.id && start(() => switchWorkspaceAction(w.id))}>
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                {w.id === current.id ? <Check className="size-4" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New workspace
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href="/team" />}>
              <Users className="size-4" /> Team
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings" />}>
              <Settings className="size-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => start(() => signOutAction())}>
              <LogOut className="size-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
          </DialogHeader>
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
              <Label htmlFor="ws-name">Name</Label>
              <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Sunrise Builders" autoFocus />
              <p className="text-xs text-muted-foreground">Use one workspace per brand or client. Each has its own channels, posts and team.</p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending || !name.trim()}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
