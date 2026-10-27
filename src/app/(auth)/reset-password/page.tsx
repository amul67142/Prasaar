import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthCard } from "../form-bits";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

async function Content({ searchParams }: { searchParams: PageProps<"/reset-password">["searchParams"] }) {
  const sp = await searchParams;
  return <ResetForm token={typeof sp.token === "string" ? sp.token : ""} />;
}

export default function ResetPasswordPage(props: PageProps<"/reset-password">) {
  return (
    <AuthCard title="Choose a new password">
      <Suspense fallback={<div className="h-56" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </AuthCard>
  );
}
