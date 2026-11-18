import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "./crypto";
import { db } from "./db/mongo";
import { Member, Workspace, Types } from "./db/models";
import { AppError, isAppError, unauthorized } from "./errors";
import { optionalEnv } from "./env";
import type { Ctx } from "./session";
import type { Role } from "./permissions";

/**
 * Machine ingest: lets a trusted process outside the browser create media and
 * posts, for pipelines that produce finished content on their own (the GTA 6
 * clipper is the first).
 *
 * Authenticated with `Authorization: Bearer $INGEST_SECRET`, the same shape as
 * cron. This is a workspace-wide key with publishing rights, so it belongs in a
 * server environment and nowhere near a browser.
 */

/** Builds a Ctx for a caller that has no session, acting as the workspace owner. */
export async function serviceCtx(): Promise<Ctx> {
  const wanted = optionalEnv("INGEST_WORKSPACE_ID");
  await db();

  const workspace = wanted
    ? await Workspace.findById(wanted).select("timezone").lean()
    : await Workspace.findOne().sort({ createdAt: 1 }).select("timezone").lean();
  if (!workspace) {
    throw new AppError("NO_WORKSPACE", "No workspace to ingest into.", 500);
  }

  // Act as a member who can actually publish. Owner first, then admin — never
  // invent a role, so permission checks in the services stay meaningful.
  const member =
    (await Member.findOne({ workspaceId: workspace._id, role: "owner" }).lean()) ??
    (await Member.findOne({ workspaceId: workspace._id, role: "admin" }).lean());
  if (!member) {
    throw new AppError("NO_OWNER", "That workspace has no owner or admin to act as.", 500);
  }

  return {
    userId: member.userId as Types.ObjectId,
    workspaceId: workspace._id,
    role: member.role as Role,
    timezone: workspace.timezone ?? "Asia/Kolkata",
  };
}

type Handler<T> = (ctx: Ctx, req: NextRequest, params: Record<string, string>) => Promise<T>;

/** Wraps a route handler with bearer auth, a service Ctx and AppError mapping. */
export function ingestHandler<T>(run: Handler<T>) {
  return async (
    req: NextRequest,
    segment?: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    const secret = optionalEnv("INGEST_SECRET");
    const header = req.headers.get("authorization") ?? "";
    // No secret configured means the feature is off, not open to everyone.
    if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
      const e = unauthorized();
      return NextResponse.json({ error: { code: e.code, message: "Bad ingest secret" } }, { status: 401 });
    }

    try {
      const params = segment ? await segment.params : {};
      const ctx = await serviceCtx();
      return NextResponse.json({ data: await run(ctx, req, params) });
    } catch (err) {
      if (isAppError(err)) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message, field: err.field } },
          { status: err.status },
        );
      }
      console.error("[ingest]", err);
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "Something went wrong." } },
        { status: 500 },
      );
    }
  };
}

/** Parses a JSON body, turning malformed input into a 400 rather than a 500. */
export async function jsonBody<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError("BAD_JSON", "Request body must be JSON.", 400);
  }
}
