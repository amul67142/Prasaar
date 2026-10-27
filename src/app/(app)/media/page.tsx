import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { can } from "@/lib/permissions";
import type { MediaKind } from "@/lib/platforms/rules";
import { requireCtx } from "@/lib/session";
import { listFolders, listMedia } from "@/lib/services/media";
import { MediaLibrary } from "./media-library";

export const metadata: Metadata = { title: "Media" };

async function Content({ searchParams }: { searchParams: PageProps<"/media">["searchParams"] }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const folder = typeof sp.folder === "string" ? sp.folder : undefined;
  const kind = sp.kind === "image" || sp.kind === "video" || sp.kind === "document" ? (sp.kind as MediaKind) : undefined;
  const before = typeof sp.before === "string" ? sp.before : undefined;
  const [page, folders] = await Promise.all([listMedia(ctx, { folder, kind, before }), listFolders(ctx)]);
  return (
    <MediaLibrary
      items={page.items}
      nextCursor={page.nextCursor}
      folders={folders}
      folder={folder}
      kind={kind}
      canWrite={can(ctx.role, "media:write")}
    />
  );
}

export default function MediaPage(props: PageProps<"/media">) {
  return (
    <>
      <PageHeader title="Media library" description="Upload once, reuse in any post. Use folders to keep each client or campaign apart." />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
