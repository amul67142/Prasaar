import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { db } from "@/lib/db/mongo";
import { DeletionRequest } from "@/lib/db/models";
import { LEGAL } from "../legal-config";

export const metadata: Metadata = { title: "Data deletion" };

async function Status({ searchParams }: { searchParams: PageProps<"/data-deletion">["searchParams"] }) {
  const { code } = await searchParams;
  await connection();
  if (typeof code !== "string") return null;
  await db();
  const request = await DeletionRequest.findOne({ code }).lean();
  return (
    <div className="rounded-xl border p-4">
      {request ? (
        <p>
          Request <code>{code}</code> is complete: {request.channelsRemoved} connected account{request.channelsRemoved === 1 ? "" : "s"} and their tokens were deleted.
        </p>
      ) : (
        <p>We couldn&apos;t find a deletion request with code <code>{code}</code>.</p>
      )}
    </div>
  );
}

export default function DataDeletionPage(props: PageProps<"/data-deletion">) {
  return (
    <>
      <h1>Delete your data</h1>
      <Suspense>
        <Status searchParams={props.searchParams} />
      </Suspense>
      <h2>Facebook and Instagram</h2>
      <p>
        Remove {LEGAL.product} from Facebook under Settings &amp; privacy → Settings → Business integrations (or Apps and websites), then choose to delete the data. Facebook tells us
        and we delete the tokens and account details for every Page and Instagram account you connected. You&apos;ll get a confirmation code you can check on this page.
      </p>
      <h2>Any other account</h2>
      <ul>
        <li>To disconnect one social account: open Accounts in {LEGAL.product}, choose the account and select Remove. Its tokens are deleted at once.</li>
        <li>To delete everything, including your login: email {LEGAL.contactEmail} from the address you signed up with. We confirm within 30 days.</li>
      </ul>
    </>
  );
}
