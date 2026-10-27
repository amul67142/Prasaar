import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthCard, linkClass } from "../form-bits";

export const metadata: Metadata = { title: "Confirm email" };

async function Message({ searchParams }: { searchParams: PageProps<"/verify">["searchParams"] }) {
  const sp = await searchParams;
  return sp.invalid ? (
    <p className="text-[15px] text-muted-foreground">This link is invalid or has expired. Log in and we&apos;ll send you a fresh one.</p>
  ) : (
    <div className="flex gap-4">
      <MailCheck className="size-8 shrink-0 text-brand" strokeWidth={1.5} />
      <p className="text-[15px] text-muted-foreground">
        We sent you a link to confirm your email address. Open it to finish signing up. It works for 24 hours.
      </p>
    </div>
  );
}

export default function VerifyPage(props: PageProps<"/verify">) {
  return (
    <AuthCard
      title="Check your email"
      footer={
        <Link href="/login" className={linkClass}>
          Go to login
        </Link>
      }
    >
      <Suspense>
        <Message searchParams={props.searchParams} />
      </Suspense>
    </AuthCard>
  );
}
