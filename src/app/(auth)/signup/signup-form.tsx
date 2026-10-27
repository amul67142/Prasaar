"use client";

import { useActionState } from "react";
import Link from "next/link";
import { googleAction, signupAction } from "../actions";
import { Field, FormError, GoogleButton, OrDivider, SubmitButton } from "../form-bits";

export function SignupForm({ google }: { google: boolean }) {
  const [state, action] = useActionState(signupAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <>
      <FormError message={state?.error} />
      <form action={action} className="space-y-5">
        <Field label="Your name" name="name" autoComplete="name" placeholder="Enter your name" required error={fe.name} />
        <Field label="Work email" name="email" type="email" autoComplete="email" placeholder="Enter your email" required error={fe.email} />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          error={fe.password}
        />
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-[var(--brand)]" required />
          <span className="text-muted-foreground">
            I agree to the{" "}
            <Link href="/terms" className="text-foreground underline" target="_blank">terms</Link> and consent to my data being processed as described in the{" "}
            <Link href="/privacy" className="text-foreground underline" target="_blank">privacy policy</Link>.
          </span>
        </label>
        {fe.consent ? <p className="text-sm text-destructive">{fe.consent}</p> : null}
        <SubmitButton>Create account</SubmitButton>
      </form>
      {google ? (
        <>
          <OrDivider />
          <form action={googleAction}>
            <input type="hidden" name="next" value="/channels" />
            <GoogleButton label="Sign up with Google" />
          </form>
        </>
      ) : null}
    </>
  );
}
