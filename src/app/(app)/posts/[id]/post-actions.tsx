"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deletePostAction, retryPostAction } from "../../compose/actions";

export function PostActions({ id, editable, status }: { id: string; editable: boolean; status: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const label = status === "draft" ? "Delete draft" : ["scheduled", "publishing"].includes(status) ? "Cancel post" : "Delete";
  if (status === "published") return null;
  return (
    <>
      {editable ? (
        <Button variant="outline" render={<Link href={`/compose?id=${id}`} />}>
          Edit
        </Button>
      ) : null}
      <Button variant="destructive" onClick={() => setConfirm(true)}>
        {label}
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}?</DialogTitle>
            <DialogDescription>
              {status === "partially_published"
                ? "Posts that already went out stay live. Anything not yet sent is cancelled."
                : "Nothing has been published from this post. This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deletePostAction(id);
                  if (!res.ok) return void toast.error(res.error.message);
                  toast.success("Done");
                  router.push("/calendar");
                })
              }
            >
              {label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RetryButton({ postId }: { postId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await retryPostAction(postId);
          if (res.ok) toast.success("Retrying now");
          else toast.error(res.error.message);
        })
      }
    >
      <RotateCw /> Retry
    </Button>
  );
}
