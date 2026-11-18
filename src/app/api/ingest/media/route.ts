import { ingestHandler, jsonBody } from "@/lib/ingest";
import { createUpload } from "@/lib/services/media";

/**
 * Reserves a media record and returns a signed PUT target.
 *
 * The caller uploads the bytes straight to that URL, not through this route:
 * a serverless function has a small request body limit and a 45-second clip is
 * tens of megabytes, so proxying the file would fail on exactly the files this
 * exists to handle.
 */
export const POST = ingestHandler(async (ctx, req) => {
  const body = await jsonBody<{
    filename?: string;
    mime?: string;
    sizeBytes?: number;
    folder?: string;
  }>(req);

  return createUpload(ctx, {
    filename: body.filename ?? "clip.mp4",
    mime: body.mime ?? "video/mp4",
    sizeBytes: Number(body.sizeBytes),
    folder: body.folder,
  });
});
