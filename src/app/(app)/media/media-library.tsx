"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderInput, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/page-header";
import { ACCEPT, useUploader } from "@/components/media/use-uploader";
import { formatBytes, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MediaKind } from "@/lib/platforms/rules";
import type { MediaView } from "@/lib/services/media";
import { MediaThumb } from "../compose/media-strip";
import { deleteMediaAction, moveMediaAction } from "./actions";

interface Props {
  items: MediaView[];
  nextCursor?: string;
  folders: string[];
  folder?: string;
  kind?: MediaKind;
  canWrite: boolean;
}

function href(params: { folder?: string; kind?: string; before?: string }) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]);
  return `/media${q.size ? `?${q}` : ""}`;
}

export function MediaLibrary({ items, nextCursor, folders, folder, kind, canWrite }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<MediaView | null>(null);
  const { items: uploads, upload } = useUploader({ folder, onUploaded: () => router.refresh() });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          <FilterLink active={folder === undefined} href={href({ kind })}>All</FilterLink>
          <FilterLink active={folder === ""} href={href({ kind, folder: "" })}>No folder</FilterLink>
          {folders.map((f) => (
            <FilterLink key={f} active={folder === f} href={href({ kind, folder: f })}>
              {f}
            </FilterLink>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            className="h-8 rounded-lg border bg-background px-2 text-sm"
            value={kind ?? ""}
            onChange={(e) => router.push(href({ folder, kind: e.target.value || undefined }))}
            aria-label="File type"
          >
            <option value="">All types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="document">PDFs</option>
          </select>
          {canWrite ? (
            <Button onClick={() => input.current?.click()}>
              <Upload /> Upload{folder ? ` to ${folder}` : ""}
            </Button>
          ) : null}
          <input
            ref={input}
            type="file"
            hidden
            multiple
            accept={ACCEPT}
            onChange={(e) => {
              if (e.target.files?.length) upload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {uploads.length ? (
        <ul className="space-y-1 rounded-xl border p-3 text-sm">
          {uploads.map((u) => (
            <li key={u.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate">{u.filename}</span>
              {u.error ? (
                <span className="text-xs text-destructive">{u.error}</span>
              ) : (
                <span className="h-1.5 w-32 overflow-hidden rounded bg-muted">
                  <span className="block h-full bg-foreground transition-all" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {items.length === 0 ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (canWrite && e.dataTransfer.files.length) upload(e.dataTransfer.files);
          }}
        >
          <EmptyState title="No files here" description={canWrite ? "Drop images, videos or PDFs here, or use Upload." : undefined} />
        </div>
      ) : (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (canWrite && e.dataTransfer.files.length) upload(e.dataTransfer.files);
          }}
        >
          {items.map((m) => (
            <button key={m.id} type="button" onClick={() => setSelected(m)} className="group text-left">
              <MediaThumb m={m} className="aspect-square w-full transition group-hover:opacity-90" />
              <p className="mt-1 truncate text-xs">{m.filename}</p>
              <p className="text-[11px] text-muted-foreground">
                {formatBytes(m.sizeBytes)}
                {m.width && m.height ? ` · ${m.width}×${m.height}` : ""}
                {m.durationSec ? ` · ${formatDuration(m.durationSec)}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}

      {nextCursor ? (
        <div className="text-center">
          <Button variant="outline" render={<Link href={href({ folder, kind, before: nextCursor })} />}>
            Older files
          </Button>
        </div>
      ) : null}

      <MediaDialog media={selected} folders={folders} canWrite={canWrite} onClose={() => setSelected(null)} />
    </div>
  );
}

function FilterLink({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn("rounded-full border px-3 py-1 text-sm", active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
    >
      {children}
    </Link>
  );
}

function MediaDialog({ media, folders, canWrite, onClose }: { media: MediaView | null; folders: string[]; canWrite: boolean; onClose: () => void }) {
  const [folder, setFolder] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={media !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {media ? (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pr-6">{media.filename}</DialogTitle>
            </DialogHeader>
            {media.kind === "video" ? (
              <video src={media.url} controls className="max-h-[50vh] w-full rounded-lg bg-black" />
            ) : (
              <MediaThumb m={media} className="max-h-[50vh] w-full [&_img]:object-contain" />
            )}
            <p className="text-xs text-muted-foreground">
              {media.mime} · {formatBytes(media.sizeBytes)}
              {media.width && media.height ? ` · ${media.width}×${media.height}` : ""}
            </p>
            {canWrite ? (
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    start(async () => {
                      const res = await moveMediaAction(media.id, folder);
                      if (!res.ok) return void toast.error(res.error.message);
                      toast.success(folder ? `Moved to ${folder}` : "Removed from folder");
                      onClose();
                    });
                  }}
                >
                  <Input list="folders" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder={media.folder || "Folder name"} className="h-8 w-40" />
                  <datalist id="folders">
                    {folders.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                  <Button type="submit" variant="outline" size="sm" disabled={pending}>
                    <FolderInput /> Move
                  </Button>
                </form>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await deleteMediaAction(media.id);
                      if (!res.ok) return void toast.error(res.error.message);
                      toast.success("File deleted");
                      onClose();
                    })
                  }
                >
                  <Trash2 /> Delete
                </Button>
              </DialogFooter>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
