import { db } from "@/lib/db/mongo";
import { Channel } from "@/lib/db/models";
import { ingestHandler } from "@/lib/ingest";

/**
 * The connected accounts an ingest caller can post to. Lets a pipeline check
 * what is reachable before it spends time producing a file for a channel that
 * has since expired.
 */
export const GET = ingestHandler(async (ctx) => {
  await db();
  const channels = await Channel.find({ workspaceId: ctx.workspaceId })
    .select("platform displayName username status externalId")
    .lean();

  return channels.map((c) => ({
    id: c._id.toString(),
    platform: c.platform,
    displayName: c.displayName,
    username: c.username ?? undefined,
    status: c.status,
    externalId: c.externalId,
  }));
});
