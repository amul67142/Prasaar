import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { googleEnabled } from "@/auth";
import { AuthCard, linkClass } from "../form-bits";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

async function LoginContent({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/home";
  const notice = sp.reset ? "Password changed. Log in with your new password." : sp.verified ? "Email confirmed. You can log in now." : undefined;
  const error = sp.error === "AccessDenied" ? "Google didn't confirm that email address." : sp.error ? "Login failed. Please try again." : undefined;
  return <LoginForm next={next} notice={notice} initialError={error} google={googleEnabled} />;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <AuthCard
      title="Log in"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className={linkClass}>
            Sign up
          </Link>
        </>
      }
    >
      <Suspense fallback={<div className="h-72" />}>
        <LoginContent searchParams={props.searchParams} />
      </Suspense>
    </AuthCard>
  );
}
