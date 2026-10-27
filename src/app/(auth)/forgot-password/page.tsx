"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotAction } from "../actions";
import { AuthCard, Field, FormNotice, linkClass, SubmitButton } from "../form-bits";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(forgotAction, undefined);
  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className={linkClass}>
            Log in
          </Link>
        </>
      }
    >
      <FormNotice message={state?.message} />
      <form action={action} className="space-y-6">
        <Field label="Email" name="email" type="email" autoComplete="email" placeholder="Enter your email" required error={state?.fieldErrors?.email} />
        <SubmitButton>Send reset link</SubmitButton>
      </form>
    </AuthCard>
  );
}
