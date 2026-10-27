import "server-only";
import { db } from "../db/mongo";
import { Channel, Member, Post, PostGroup, User, Workspace } from "../db/models";
import type { Platform } from "../platforms/catalog";
import type { Ctx } from "../session";

/** Everything the Home page shows, in one round of queries. */
export async function getHomeSummary(ctx: Ctx) {
  await db();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const ws = ctx.workspaceId;

  const [user, workspace, scheduled, publishedThisMonth, failed, channels, upcoming, members, anyPost] = await Promise.all([
    User.findById(ctx.userId).select("name").lean(),
    Workspace.findById(ws).select("name").lean(),
    PostGroup.countDocuments({ workspaceId: ws, status: "scheduled", scheduledAt: { $gte: now } }),
    Post.countDocuments({ workspaceId: ws, status: "published", publishedAt: { $gte: monthStart } }),
    Post.countDocuments({ workspaceId: ws, status: "failed" }),
    Channel.find({ workspaceId: ws }).select("platform displayName avatar status slots").sort({ displayName: 1 }).lean(),
    PostGroup.find({ workspaceId: ws, status: { $in: ["scheduled", "publishing"] }, scheduledAt: { $gte: now } })
      .sort({ scheduledAt: 1 })
      .limit(5)
      .select("content scheduledAt channelIds status")
      .lean(),
    Member.countDocuments({ workspaceId: ws }),
    PostGroup.exists({ workspaceId: ws }),
  ]);

  const platformOf = new Map(channels.map((c) => [c._id.toString(), c.platform as Platform]));
  return {
    firstName: (user?.name ?? "there").split(" ")[0],
    workspaceName: workspace?.name ?? "your workspace",
    stats: { scheduled, publishedThisMonth, failed, channels: channels.length },
    channels: channels.map((c) => ({
      id: c._id.toString(),
      platform: c.platform as Platform,
      displayName: c.displayName,
      avatar: c.avatar ?? undefined,
      status: c.status as string,
    })),
    upcoming: upcoming.map((g) => ({
      id: g._id.toString(),
      snippet: (g.content ?? "").slice(0, 120),
      scheduledAt: g.scheduledAt!.toISOString(),
      platforms: [...new Set(g.channelIds.map((c) => platformOf.get(c.toString())).filter(Boolean))] as Platform[],
    })),
    checklist: {
      channel: channels.length > 0,
      post: Boolean(anyPost),
      queue: channels.some((c) => (c.slots ?? []).length > 0),
      team: members > 1,
    },
  };
}
