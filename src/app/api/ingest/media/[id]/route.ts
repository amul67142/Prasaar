import { ingestHandler } from "@/lib/ingest";
import { completeUpload } from "@/lib/services/media";

/**
 * Marks an upload finished. Storage is inspected here, so this is also where a
 * truncated or oversized file is caught — the media stays unusable rather than
 * reaching a platform and failing there.
 */
export const POST = ingestHandler(async (ctx, _req, params) => completeUpload(ctx, params.id));
