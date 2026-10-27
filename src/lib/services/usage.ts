import "server-only";
import { db } from "../db/mongo";
import { Channel, PostGroup, Workspace } from "../db/models";
import { planLimits } from "../plans";
import type { Ctx } from "../session";

/** What the sidebar's plan card shows: this month's posts and connected accounts against the plan. */
export async function getUsage(ctx: Ctx) {
  await db();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [workspace, posts, channels] = await Promise.all([
    Workspace.findById(ctx.workspaceId).select("planId").lean(),
    PostGroup.countDocuments({ workspaceId: ctx.workspaceId, status: { $ne: "draft" }, scheduledAt: { $gte: start, $lt: end } }),
    Channel.countDocuments({ workspaceId: ctx.workspaceId }),
  ]);
  const limits = planLimits(workspace?.planId);
  return {
    plan: limits.name,
    posts,
    postsLimit: Number.isFinite(limits.postsPerMonth) ? limits.postsPerMonth : null,
    channels,
    channelsLimit: limits.maxChannels,
  };
}
