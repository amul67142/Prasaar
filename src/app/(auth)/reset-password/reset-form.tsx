"use client";

import { useActionState } from "react";
import { resetAction } from "../actions";
import { Field, FormError, SubmitButton } from "../form-bits";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetAction, undefined);
  return (
    <>
      <FormError message={state?.error ?? (token ? undefined : "This link is missing its code. Request a new one.")} />
      <form action={action} className="space-y-6">
        <input type="hidden" name="token" value={token} />
        <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required error={state?.fieldErrors?.password} />
        <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required error={state?.fieldErrors?.confirm} />
        <SubmitButton disabled={!token}>Save password</SubmitButton>
      </form>
    </>
  );
}
