"use client";

import { Suspense, use, useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronLeft, ChevronRight, FileText, Film, ImagePlus, Library, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACCEPT, useUploader } from "@/components/media/use-uploader";
import { cn } from "@/lib/utils";
import type { MediaView } from "@/lib/services/media";
import { listMediaAction } from "../media/actions";

export function MediaThumb({ m, className }: { m: MediaView; className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden rounded-lg bg-muted", className)}>
      {m.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- CDN media, exact bytes
        <img src={m.url} alt={m.filename} className="size-full object-cover" loading="lazy" />
      ) : m.kind === "video" ? (
        <>
          <video src={`${m.url}#t=0.5`} className="size-full object-cover" muted preload="metadata" />
          <Film className="absolute right-1 bottom-1 size-4 text-white drop-shadow" />
        </>
      ) : (
        <div className="flex flex-col items-center gap-1 p-2 text-center">
          <FileText className="size-6 text-muted-foreground" />
          <span className="line-clamp-2 text-[10px] text-muted-foreground">{m.filename}</span>
        </div>
      )}
    </div>
  );
}

export function MediaStrip({ media, onChange }: { media: MediaView[]; onChange: Dispatch<SetStateAction<MediaView[]>> }) {
  const input = useRef<HTMLInputElement>(null);
  const [libraryPage, setLibraryPage] = useState<LibraryPage | null>(null);
  const onUploaded = useCallback((m: MediaView) => onChange((prev) => [...prev, m]), [onChange]);
  const { items, upload } = useUploader({ onUploaded });

  const move = (i: number, d: -1 | 1) => {
    const next = [...media];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  return (
    <div
      className="space-y-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      {media.length || items.length ? (
        <div className="flex flex-wrap gap-2">
          {media.map((m, i) => (
            <div key={m.id} className="group relative size-24">
              <MediaThumb m={m} className="size-24" />
              <button type="button" onClick={() => onChange(media.filter((x) => x.id !== m.id))} className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white" aria-label="Remove">
                <X className="size-3.5" />
              </button>
              {media.length > 1 ? (
                <div className="absolute inset-x-1 bottom-1 hidden justify-between group-hover:flex">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded bg-black/60 p-0.5 text-white disabled:opacity-0" aria-label="Move left">
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <button type="button" disabled={i === media.length - 1} onClick={() => move(i, 1)} className="rounded bg-black/60 p-0.5 text-white disabled:opacity-0" aria-label="Move right">
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {items.map((u) => (
            <div key={u.id} className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-2 text-center">
              <span className="line-clamp-2 text-[10px] text-muted-foreground">{u.filename}</span>
              {u.error ? (
                <span className="text-[10px] text-destructive">{u.error}</span>
              ) : (
                <div className="h-1 w-full overflow-hidden rounded bg-muted">
                  <div className="h-full bg-foreground transition-all" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          <ImagePlus /> Upload
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setLibraryPage(listMediaAction({}))}>
          <Library /> From library
        </Button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <LibraryDialog
        first={libraryPage}
        onOpenChange={(o) => !o && setLibraryPage(null)}
        exclude={media.map((m) => m.id)}
        onPick={(picked) => onChange([...media, ...picked])}
      />
    </div>
  );
}

type LibraryPage = ReturnType<typeof listMediaAction>;

function LibraryDialog({
  first,
  onOpenChange,
  exclude,
  onPick,
}: {
  /** Set when open: the first page, requested by the click that opened it. */
  first: LibraryPage | null;
  onOpenChange: (o: boolean) => void;
  exclude: string[];
  onPick: (m: MediaView[]) => void;
}) {
  const open = first !== null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Media library</DialogTitle>
        </DialogHeader>
        {first ? (
          <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}>
            <LibraryBody
              first={first}
              exclude={exclude}
              onDone={(m) => {
                onPick(m);
                onOpenChange(false);
              }}
            />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LibraryBody({ first, exclude, onDone }: { first: LibraryPage; exclude: string[]; onDone: (m: MediaView[]) => void }) {
  const firstPage = use(first);
  const [more, setMore] = useState<MediaView[]>([]);
  const [cursor, setCursor] = useState(firstPage.ok ? firstPage.data.nextCursor : undefined);
  const [picked, setPicked] = useState<string[]>([]);
  const items = [...(firstPage.ok ? firstPage.data.items : []), ...more];

  async function load(before: string) {
    const res = await listMediaAction({ before });
    if (!res.ok) return void toast.error(res.error.message);
    setMore((prev) => [...prev, ...res.data.items]);
    setCursor(res.data.nextCursor);
  }

  return (
    <>
        <div className="max-h-[60vh] overflow-y-auto">
          {!firstPage.ok ? (
            <p className="py-10 text-center text-sm text-destructive">{firstPage.error.message}</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing here yet. Upload files from the composer or the Media page.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {items.map((m) => {
                const used = exclude.includes(m.id);
                const on = picked.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={used}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                    className={cn("relative aspect-square rounded-lg ring-offset-2", on && "ring-2 ring-foreground", used && "opacity-40")}
                  >
                    <MediaThumb m={m} className="size-full" />
                    {on ? (
                      <span className="absolute top-1 left-1 flex size-5 items-center justify-center rounded-full bg-foreground text-[11px] text-background">
                        {picked.indexOf(m.id) + 1}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          {cursor ? (
            <div className="pt-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => load(cursor)}>
                Load more
              </Button>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button disabled={picked.length === 0} onClick={() => onDone(picked.map((id) => items.find((m) => m.id === id)!))}>
            Add {picked.length || ""}
          </Button>
        </DialogFooter>
    </>
  );
}
