"use client";

import { useActionState } from "react";
import Link from "next/link";
import { googleAction, loginAction } from "../actions";
import { Field, FormError, FormNotice, GoogleButton, linkClass, OrDivider, SubmitButton } from "../form-bits";

export function LoginForm({ next, notice, initialError, google }: { next: string; notice?: string; initialError?: string; google: boolean }) {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <>
      <FormNotice message={notice} />
      <FormError message={state?.error ?? initialError} />
      <form action={action} className="space-y-6">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" name="email" type="email" autoComplete="email" placeholder="Enter your email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
          aside={
            <Link href="/forgot-password" className={`text-sm ${linkClass}`}>
              Forgot password?
            </Link>
          }
        />
        <SubmitButton>Log in</SubmitButton>
      </form>
      {google ? (
        <>
          <OrDivider />
          <form action={googleAction}>
            <input type="hidden" name="next" value={next} />
            <GoogleButton label="Continue with Google" />
          </form>
        </>
      ) : null}
    </>
  );
}
