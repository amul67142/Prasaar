import { db } from "@/lib/db/mongo";
import { Channel, Types } from "@/lib/db/models";
import { AppError } from "@/lib/errors";
import { ingestHandler, jsonBody } from "@/lib/ingest";
import { PLATFORMS, type Platform } from "@/lib/platforms/catalog";
import { savePostGroup, type PostInput } from "@/lib/services/posts";

interface Body {
  content?: string;
  mediaIds?: string[];
  /** Either name platforms and let active channels be resolved, or pass ids. */
  platforms?: string[];
  channelIds?: string[];
  when?: PostInput["when"];
  youtube?: {
    title?: string;
    tags?: string[];
    privacy?: "public" | "unlisted" | "private";
    categoryId?: string;
    madeForKids?: boolean;
    playlistId?: string;
    thumbnailId?: string;
  };
  instagram?: { content?: string; format?: "feed" | "reel" | "story" };
}

/** Resolves platform names to the workspace's active channels on those platforms. */
async function channelsFor(workspaceId: Types.ObjectId, platforms: string[]): Promise<string[]> {
  const wanted = platforms.filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p));
  if (wanted.length !== platforms.length) {
    const bad = platforms.filter((p) => !(PLATFORMS as readonly string[]).includes(p));
    throw new AppError("UNKNOWN_PLATFORM", `Not a platform we post to: ${bad.join(", ")}`, 400, "platforms");
  }
  await db();
  const found = await Channel.find({ workspaceId, platform: { $in: wanted }, status: "active" })
    .select({ platform: 1 })
    .lean();

  const missing = wanted.filter((p) => !found.some((c) => c.platform === p));
  if (missing.length) {
    throw new AppError(
      "CHANNEL_NOT_CONNECTED",
      `No active ${missing.join(" or ")} account is connected. Connect it in Prasaar first.`,
      400,
      "platforms",
    );
  }
  return found.map((c) => c._id.toString());
}

/**
 * Creates a post from an outside pipeline and hands it to the normal publish
 * path — the same validation, scheduling, retry and logging a dashboard post
 * gets. Nothing here talks to a platform directly.
 */
export const POST = ingestHandler(async (ctx, req) => {
  const body = await jsonBody<Body>(req);

  const channelIds = body.channelIds?.length
    ? body.channelIds
    : await channelsFor(ctx.workspaceId, body.platforms ?? ["youtube"]);

  if (!body.mediaIds?.length) {
    throw new AppError("NO_MEDIA", "A clip needs its media uploaded first.", 400, "mediaIds");
  }

  const input: PostInput = {
    content: body.content ?? "",
    channelIds,
    mediaIds: body.mediaIds,
    // Default to a draft. An automated producer should have to ask for
    // publishing explicitly, so a misfiring loop fills the drafts list
    // instead of the channel.
    when: body.when ?? { mode: "draft" },
    perPlatform: {
      ...(body.youtube && {
        youtube: {
          title: body.youtube.title,
          tags: body.youtube.tags,
          privacy: body.youtube.privacy ?? "public",
          categoryId: (body.youtube.categoryId ?? "20") as never, // 20 = Gaming
          madeForKids: body.youtube.madeForKids ?? false,
          playlistId: body.youtube.playlistId,
          thumbnailId: body.youtube.thumbnailId,
        },
      }),
      ...(body.instagram && {
        instagram: {
          content: body.instagram.content,
          format: body.instagram.format ?? "reel",
        },
      }),
    },
  };

  const group = await savePostGroup(ctx, input, { source: "api" });
  return group;
});
