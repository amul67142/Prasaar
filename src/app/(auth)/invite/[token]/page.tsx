import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/lib/session";
import { getInvite } from "@/lib/services/team";
import { acceptInviteAction } from "./actions";

export const metadata: Metadata = { title: "Join workspace" };

async function Invite({ params }: { params: PageProps<"/invite/[token]">["params"] }) {
  const { token } = await params;
  await connection();
  const [invite, user] = await Promise.all([getInvite(token), currentUser()]);
  if (!invite) {
    return (
      <>
        <h1 className="text-lg font-semibold">Invite not valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have expired or already been used. Ask for a new invite.</p>
      </>
    );
  }
  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <>
      <h1 className="text-lg font-semibold">Join {invite.workspaceName}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You&apos;ve been invited as <span className="font-medium text-foreground">{invite.role}</span>. This invite is for {invite.email}.
      </p>
      <div className="mt-5">
        {user ? (
          user.email === invite.email ? (
            <form action={acceptInviteAction}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit" size="lg" className="w-full">Accept and open workspace</Button>
            </form>
          ) : (
            <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm">
              You&apos;re logged in as {user.email}. Log out and log in as {invite.email} to accept.
            </p>
          )
        ) : (
          <div className="flex flex-col gap-2">
            <Button render={<Link href={`/login?next=${next}`} />} size="lg">Log in to accept</Button>
            <Button render={<Link href="/signup" />} variant="outline" size="lg">Create an account with {invite.email}</Button>
          </div>
        )}
      </div>
    </>
  );
}

export default function InvitePage(props: PageProps<"/invite/[token]">) {
  return (
    <div className="rounded-2xl border bg-background p-7 shadow-[0_8px_30px_rgb(0,0,0,0.06)] sm:p-12 [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-bold">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading invite…</p>}>
        <Invite params={props.params} />
      </Suspense>
    </div>
  );
}
