import "server-only";
import { db } from "../db/mongo";
import { Media, PostGroup, Workspace, Types, type MediaDoc } from "../db/models";
import { randomToken } from "../crypto";
import { AppError, notFound } from "../errors";
import { planLimits } from "../plans";
import { assertCan, type Ctx } from "../session";
import { storage, type UploadTarget } from "../storage";
import type { MediaKind } from "../platforms/rules";

const MB = 1024 * 1024;

const ACCEPTED: Record<string, { kind: MediaKind; ext: string }> = {
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/png": { kind: "image", ext: "png" },
  "image/gif": { kind: "image", ext: "gif" },
  "image/webp": { kind: "image", ext: "webp" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/quicktime": { kind: "video", ext: "mov" },
  "application/pdf": { kind: "document", ext: "pdf" },
};

export interface MediaView {
  id: string;
  url: string;
  filename: string;
  mime: string;
  kind: MediaKind;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationSec?: number;
  status: "uploading" | "ready" | "failed";
  folder: string;
  createdAt: string;
}

export function toMediaView(m: MediaDoc): MediaView {
  return {
    id: m._id.toString(),
    url: m.url,
    filename: m.filename,
    mime: m.mime,
    kind: m.kind as MediaKind,
    sizeBytes: m.sizeBytes,
    width: m.width ?? undefined,
    height: m.height ?? undefined,
    durationSec: m.durationSec ?? undefined,
    status: m.status as MediaView["status"],
    folder: m.folder ?? "",
    createdAt: (m as MediaDoc & { createdAt: Date }).createdAt.toISOString(),
  };
}

export async function createUpload(
  ctx: Ctx,
  input: { filename: string; mime: string; sizeBytes: number; folder?: string },
): Promise<{ media: MediaView; upload: UploadTarget }> {
  assertCan(ctx, "media:write");
  await db();
  const type = ACCEPTED[input.mime];
  if (!type) throw new AppError("MEDIA_TYPE_UNSUPPORTED", "Upload JPEG, PNG, GIF, WebP, MP4, MOV or PDF files.", 400, "mime");

  const workspace = await Workspace.findById(ctx.workspaceId).select("planId").lean();
  const max = type.kind === "video" ? planLimits(workspace?.planId).maxVideoBytes : type.kind === "image" ? 20 * MB : 100 * MB;
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) throw new AppError("INVALID_SIZE", "File size is missing.", 400, "sizeBytes");
  if (input.sizeBytes > max) {
    throw new AppError("MEDIA_TOO_LARGE", `This file is over the ${Math.round(max / MB)} MB limit for ${type.kind}s on your plan.`, 413, "sizeBytes");
  }

  const key = `media/${ctx.workspaceId.toString()}/${randomToken(18)}.${type.ext}`;
  const doc = await Media.create({
    workspaceId: ctx.workspaceId,
    storageKey: key,
    url: (await storage()).publicUrl(key),
    filename: input.filename.slice(0, 200) || `upload.${type.ext}`,
    mime: input.mime,
    kind: type.kind,
    sizeBytes: input.sizeBytes,
    status: "uploading",
    folder: (input.folder ?? "").trim().slice(0, 80),
    uploadedBy: ctx.userId,
  });
  return { media: toMediaView(doc), upload: await (await storage()).createUpload(key, { mime: input.mime, maxBytes: input.sizeBytes }) };
}

export async function completeUpload(ctx: Ctx, id: string): Promise<MediaView> {
  assertCan(ctx, "media:write");
  await db();
  const doc = await Media.findOne({ _id: id, workspaceId: ctx.workspaceId });
  if (!doc) throw notFound("Media");
  if (doc.status === "ready") return toMediaView(doc);

  const info = await (await storage()).inspect(doc.storageKey);
  if (!info) throw new AppError("UPLOAD_MISSING", "The file didn't finish uploading. Try again.", 409);
  if (info.sizeBytes > doc.sizeBytes) {
    doc.status = "failed";
    await doc.save();
    throw new AppError("MEDIA_TOO_LARGE", "The uploaded file is larger than declared.", 413);
  }
  doc.set({
    sizeBytes: info.sizeBytes,
    checksum: info.checksum,
    width: info.width,
    height: info.height,
    durationSec: info.durationSec,
    status: "ready",
  });
  await doc.save();
  return toMediaView(doc);
}

export async function listMedia(ctx: Ctx, opts: { folder?: string; kind?: MediaKind; before?: string; limit?: number } = {}) {
  await db();
  const filter: Record<string, unknown> = { workspaceId: ctx.workspaceId, status: "ready", inLibrary: true };
  if (opts.folder !== undefined) filter.folder = opts.folder;
  if (opts.kind) filter.kind = opts.kind;
  if (opts.before && Types.ObjectId.isValid(opts.before)) filter._id = { $lt: new Types.ObjectId(opts.before) };
  const limit = Math.min(opts.limit ?? 60, 200);
  const docs = await Media.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  return {
    items: docs.slice(0, limit).map((d) => toMediaView(d as MediaDoc)),
    nextCursor: docs.length > limit ? docs[limit - 1]._id.toString() : undefined,
  };
}

export async function listFolders(ctx: Ctx): Promise<string[]> {
  await db();
  const folders = await Media.distinct("folder", { workspaceId: ctx.workspaceId, status: "ready", inLibrary: true });
  return (folders as string[]).filter(Boolean).sort();
}

export async function moveMedia(ctx: Ctx, id: string, folder: string) {
  assertCan(ctx, "media:write");
  await db();
  const res = await Media.updateOne({ _id: id, workspaceId: ctx.workspaceId }, { folder: folder.trim().slice(0, 80) });
  if (!res.matchedCount) throw notFound("Media");
}

export async function deleteMedia(ctx: Ctx, id: string) {
  assertCan(ctx, "media:write");
  await db();
  const doc = await Media.findOne({ _id: id, workspaceId: ctx.workspaceId });
  if (!doc) throw notFound("Media");
  const inUse = await PostGroup.exists({
    workspaceId: ctx.workspaceId,
    mediaIds: doc._id,
    status: { $in: ["scheduled", "publishing", "pending_approval"] },
  });
  if (inUse) throw new AppError("MEDIA_IN_USE", "This file is attached to a scheduled post. Remove it from the post first.", 409);
  await (await storage()).remove(doc.storageKey);
  await PostGroup.updateMany({ workspaceId: ctx.workspaceId, status: "draft" }, { $pull: { mediaIds: doc._id } });
  await doc.deleteOne();
}

/** Media for a post, in the given order, all owned by the workspace and ready. */
export async function loadPostMedia(workspaceId: Types.ObjectId, ids: (string | Types.ObjectId)[]): Promise<MediaDoc[]> {
  if (ids.length === 0) return [];
  await db();
  const docs = await Media.find({ _id: { $in: ids }, workspaceId }).lean();
  const byId = new Map(docs.map((d) => [d._id.toString(), d as MediaDoc]));
  return ids.map((id, i) => {
    const doc = byId.get(id.toString());
    if (!doc) throw new AppError("MEDIA_NOT_FOUND", "An attached file no longer exists.", 400, `mediaIds[${i}]`);
    if (doc.status !== "ready") throw new AppError("MEDIA_NOT_READY", `${doc.filename} hasn't finished uploading.`, 400, `mediaIds[${i}]`);
    return doc;
  });
}
