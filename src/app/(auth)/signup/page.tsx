import type { Metadata } from "next";
import Link from "next/link";
import { googleEnabled } from "@/auth";
import { AuthCard, linkClass } from "../form-bits";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Free to start. No card needed."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className={linkClass}>
            Log in
          </Link>
        </>
      }
    >
      <SignupForm google={googleEnabled} />
    </AuthCard>
  );
}
