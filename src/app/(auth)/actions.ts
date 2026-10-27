"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { isAppError } from "@/lib/errors";
import { rateLimit } from "@/lib/ratelimit";
import { createUserWithWorkspace, resetPassword, sendPasswordReset, sendVerificationEmail } from "@/lib/services/accounts";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; message?: string } | undefined;

const LOGIN_ERRORS: Record<string, string> = {
  invalid_credentials: "That email and password don't match.",
  email_not_verified: "Confirm your email first. We've sent you a new link.",
  too_many_attempts: "Too many attempts. Wait 15 minutes and try again.",
};

/** Only allow redirects back into the app. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/home";
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  try {
    await signIn("credentials", { email, password: String(form.get("password") ?? ""), redirectTo: safeNext(form.get("next")) });
  } catch (err) {
    if (err instanceof AuthError) {
      const code = (err as AuthError & { code?: string }).code ?? "invalid_credentials";
      if (code === "email_not_verified") await sendVerificationEmail(email);
      return { error: LOGIN_ERRORS[code] ?? LOGIN_ERRORS.invalid_credentials };
    }
    throw err;
  }
}

export async function googleAction(form: FormData) {
  await signIn("google", { redirectTo: safeNext(form.get("next")) });
}

const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
  consent: z.literal("on", { error: "Please agree to the terms and privacy policy." }),
});

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const limit = await rateLimit("signup", parsed.data.email.toLowerCase(), 5, "1 h");
  if (!limit.ok) return { error: "Too many attempts. Try again later." };
  try {
    await createUserWithWorkspace({ name: parsed.data.name, email: parsed.data.email, password: parsed.data.password });
  } catch (err) {
    if (isAppError(err)) return { fieldErrors: { [err.field ?? "email"]: err.message } };
    throw err;
  }
  await sendVerificationEmail(parsed.data.email);
  redirect(`/verify?sent=1`);
}

export async function forgotAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(email).success) return { fieldErrors: { email: "Enter a valid email address." } };
  const limit = await rateLimit("forgot", email, 5, "1 h");
  if (limit.ok) await sendPasswordReset(email);
  // Same answer whether or not the account exists.
  return { message: "If there's an account for that email, a reset link is on its way." };
}

export async function resetAction(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { fieldErrors: { password: "Use at least 8 characters." } };
  if (password !== form.get("confirm")) return { fieldErrors: { confirm: "Passwords don't match." } };
  try {
    await resetPassword(String(form.get("token") ?? ""), password);
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
  redirect("/login?reset=1");
}
