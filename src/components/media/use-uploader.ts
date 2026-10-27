"use client";

import { useCallback, useState } from "react";
import { finishUploadAction, startUploadAction } from "@/app/(app)/media/actions";
import type { MediaView } from "@/lib/services/media";

export interface UploadItem {
  id: string;
  filename: string;
  progress: number;
  error?: string;
}

function put(url: string, file: File, headers: Record<string, string>, onProgress: (p: number) => void) {
  // XHR rather than fetch, for upload progress.
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.send(file);
  });
}

/** Uploads straight from the browser to storage, never through our server functions. */
export function useUploader(opts: { folder?: string; onUploaded: (m: MediaView) => void }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const { folder, onUploaded } = opts;

  const upload = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const tempId = `${file.name}-${file.size}-${Date.now()}`;
        const patch = (p: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.id === tempId ? { ...i, ...p } : i)));
        setItems((list) => [...list, { id: tempId, filename: file.name, progress: 0 }]);
        try {
          const started = await startUploadAction({ filename: file.name, mime: file.type, sizeBytes: file.size, folder });
          if (!started.ok) throw new Error(started.error.message);
          await put(started.data.upload.url, file, started.data.upload.headers, (progress) => patch({ progress }));
          const done = await finishUploadAction(started.data.media.id);
          if (!done.ok) throw new Error(done.error.message);
          setItems((list) => list.filter((i) => i.id !== tempId));
          onUploaded(done.data);
        } catch (err) {
          patch({ error: err instanceof Error ? err.message : "Upload failed" });
          setTimeout(() => setItems((list) => list.filter((i) => i.id !== tempId)), 6000);
        }
      }
    },
    [folder, onUploaded],
  );

  return { items, upload };
}

export const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,application/pdf";
