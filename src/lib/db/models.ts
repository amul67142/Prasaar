import "server-only";
import mongoose, { Schema, type InferSchemaType, type Model, Types } from "mongoose";
import { PLATFORMS } from "../platforms/catalog";

const { ObjectId, Mixed } = Schema.Types;

// Untyped model() then cast: the generic overload sends tsc into a memory blow-up.
function model<T>(name: string, schema: Schema): Model<T> {
  return (mongoose.models[name] ?? mongoose.model(name, schema)) as unknown as Model<T>;
}

// ---------- users ----------
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: String,
    googleId: { type: String, index: { unique: true, sparse: true } },
    image: String,
    emailVerifiedAt: Date,
    locale: { type: String, enum: ["en", "hi"], default: "en" },
    timezone: { type: String, default: "Asia/Kolkata" },
    notify: {
      postFailed: { type: Boolean, default: true },
      tokenExpiring: { type: Boolean, default: true },
    },
    lastWorkspaceId: ObjectId,
    consentAt: Date,
  },
  { timestamps: true },
);
export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const User = model<UserDoc>("User", userSchema);

// ---------- auth tokens (email verification, password reset) ----------
const authTokenSchema = new Schema({
  userId: { type: ObjectId, required: true, index: true },
  type: { type: String, enum: ["verify_email", "reset_password"], required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 },
  usedAt: Date,
});
export type AuthTokenDoc = InferSchemaType<typeof authTokenSchema> & { _id: Types.ObjectId };
export const AuthToken = model<AuthTokenDoc>("AuthToken", authTokenSchema);

// ---------- workspaces & members ----------
const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerId: { type: ObjectId, required: true, index: true },
    type: { type: String, enum: ["personal", "agency", "client"], default: "personal" },
    parentAgencyId: { type: ObjectId, index: true },
    planId: { type: String, default: "beta" },
    timezone: { type: String, default: "Asia/Kolkata" },
    /** Last manual "Refresh stats", to keep platform API use in check. */
    analyticsRefreshedAt: Date,
  },
  { timestamps: true },
);
export type WorkspaceDoc = InferSchemaType<typeof workspaceSchema> & { _id: Types.ObjectId };
export const Workspace = model<WorkspaceDoc>("Workspace", workspaceSchema);

export const ROLES = ["owner", "admin", "editor", "approver", "viewer"] as const;
export type Role = (typeof ROLES)[number];

const memberSchema = new Schema(
  {
    workspaceId: { type: ObjectId, required: true },
    userId: { type: ObjectId, required: true, index: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { timestamps: true },
);
memberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
export type MemberDoc = InferSchemaType<typeof memberSchema> & { _id: Types.ObjectId };
export const Member = model<MemberDoc>("Member", memberSchema);

const inviteSchema = new Schema(
  {
    workspaceId: { type: ObjectId, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ROLES, required: true },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: ObjectId, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    acceptedAt: Date,
  },
  { timestamps: true },
);
export type InviteDoc = InferSchemaType<typeof inviteSchema> & { _id: Types.ObjectId };
export const Invite = model<InviteDoc>("Invite", inviteSchema);

// ---------- channels ----------
const slotSchema = new Schema(
  { day: { type: Number, min: 0, max: 6, required: true }, time: { type: String, required: true } },
  { _id: false },
);

const channelSchema = new Schema(
  {
    workspaceId: { type: ObjectId, required: true, index: true },
    platform: { type: String, enum: PLATFORMS, required: true },
    externalId: { type: String, required: true },
    displayName: { type: String, required: true },
    username: String,
    avatar: String,
    /** Encrypted JSON of the platform credentials (tokens, app password, bot token). */
    credentialsEnc: { type: String, required: true },
    tokenExpiresAt: Date,
    status: { type: String, enum: ["active", "expired", "revoked"], default: "active" },
    /** Non-secret platform data: instance URL, chat id, page id, character limit... */
    meta: { type: Mixed, default: {} },
    /** Weekly posting slots, in the workspace timezone. day 0 = Sunday. */
    slots: { type: [slotSchema], default: [] },
    connectedBy: ObjectId,
    lastError: String,
    expiryAlertSentAt: Date,
    /** Latest follower / subscriber count, and why stats may be partial. */
    followers: Number,
    analyticsNote: String,
  },
  { timestamps: true, minimize: false },
);
channelSchema.index({ workspaceId: 1, platform: 1, externalId: 1 }, { unique: true });
export type ChannelDoc = InferSchemaType<typeof channelSchema> & { _id: Types.ObjectId };
export const Channel = model<ChannelDoc>("Channel", channelSchema);

/** One follower count per channel per day (UTC), for growth over time. Written by the analytics collector. */
const channelStatSchema = new Schema({
  workspaceId: { type: ObjectId, required: true },
  channelId: { type: ObjectId, required: true },
  day: { type: String, required: true },
  followers: { type: Number, required: true },
  at: { type: Date, default: Date.now },
});
channelStatSchema.index({ channelId: 1, day: 1 }, { unique: true });
channelStatSchema.index({ workspaceId: 1, day: 1 });
export type ChannelStatDoc = InferSchemaType<typeof channelStatSchema> & { _id: Types.ObjectId };
export const ChannelStat = model<ChannelStatDoc>("ChannelStat", channelStatSchema);

// ---------- OAuth handshakes ----------
const oauthStateSchema = new Schema({
  state: { type: String, required: true, unique: true },
  workspaceId: { type: ObjectId, required: true },
  userId: { type: ObjectId, required: true },
  platform: { type: String, required: true },
  codeVerifier: String,
  meta: { type: Mixed, default: {} },
  expiresAt: { type: Date, required: true, expires: 0 },
});
export type OAuthStateDoc = InferSchemaType<typeof oauthStateSchema> & { _id: Types.ObjectId };
export const OAuthState = model<OAuthStateDoc>("OAuthState", oauthStateSchema);

/** Accounts found by an OAuth login, waiting for the user to pick which to add. */
const pendingConnectionSchema = new Schema({
  workspaceId: { type: ObjectId, required: true },
  userId: { type: ObjectId, required: true },
  platformGroup: { type: String, required: true },
  candidatesEnc: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});
export type PendingConnectionDoc = InferSchemaType<typeof pendingConnectionSchema> & { _id: Types.ObjectId };
export const PendingConnection = model<PendingConnectionDoc>("PendingConnection", pendingConnectionSchema);

const mastodonAppSchema = new Schema(
  {
    instance: { type: String, required: true },
    redirectUri: { type: String, required: true },
    clientId: { type: String, required: true },
    clientSecretEnc: { type: String, required: true },
  },
  { timestamps: true },
);
mastodonAppSchema.index({ instance: 1, redirectUri: 1 }, { unique: true });
export type MastodonAppDoc = InferSchemaType<typeof mastodonAppSchema> & { _id: Types.ObjectId };
export const MastodonApp = model<MastodonAppDoc>("MastodonApp", mastodonAppSchema);

// ---------- posts ----------
export const GROUP_STATUSES = [
  "draft",
  "pending_approval",
  "scheduled",
  "publishing",
  "published",
  "partially_published",
  "failed",
] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];

const postGroupSchema = new Schema(
  {
    workspaceId: { type: ObjectId, required: true },
    content: { type: String, default: "" },
    /** Per-platform overrides: { linkedin: { content, firstComment }, instagram: { format } } */
    perPlatform: { type: Mixed, default: {} },
    mediaIds: { type: [ObjectId], default: [] },
    channelIds: { type: [ObjectId], default: [] },
    firstComment: String,
    scheduledAt: Date,
    status: { type: String, enum: GROUP_STATUSES, default: "draft" },
    approval: {
      state: { type: String, enum: ["none", "pending", "approved", "rejected"], default: "none" },
      by: ObjectId,
      at: Date,
      comment: String,
    },
    createdBy: { type: ObjectId, required: true },
    source: { type: String, enum: ["dashboard", "api", "mcp"], default: "dashboard" },
  },
  { timestamps: true, minimize: false },
);
postGroupSchema.index({ workspaceId: 1, scheduledAt: 1 });
postGroupSchema.index({ workspaceId: 1, status: 1, updatedAt: -1 });
export type PostGroupDoc = InferSchemaType<typeof postGroupSchema> & { _id: Types.ObjectId };
export const PostGroup = model<PostGroupDoc>("PostGroup", postGroupSchema);

export const POST_STATUSES = [
  "draft",
  "scheduled",
  "publishing",
  "retrying",
  "published",
  "failed",
  "cancelled",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

const postSchema = new Schema(
  {
    postGroupId: { type: ObjectId, required: true, index: true },
    workspaceId: { type: ObjectId, required: true },
    channelId: { type: ObjectId, required: true, index: true },
    platform: { type: String, enum: PLATFORMS, required: true },
    status: { type: String, enum: POST_STATUSES, default: "draft" },
    scheduledAt: Date,
    nextAttemptAt: Date,
    lockedAt: Date,
    attempts: { type: Number, default: 0 },
    platformPostId: String,
    permalink: String,
    lastError: { code: String, message: String },
    publishedAt: Date,
    firstCommentStatus: { type: String, enum: ["none", "posted", "failed"], default: "none" },
    queueMessageId: String,
    /** Engagement as the platform last reported it; fields it doesn't share stay unset. */
    metrics: {
      likes: Number,
      comments: Number,
      shares: Number,
      saves: Number,
      views: Number,
      reach: Number,
    },
    metricsAt: Date,
  },
  { timestamps: true },
);
postSchema.index({ status: 1, scheduledAt: 1 });
postSchema.index({ status: 1, nextAttemptAt: 1 });
postSchema.index({ workspaceId: 1, scheduledAt: 1 });
postSchema.index({ workspaceId: 1, status: 1, publishedAt: -1 });
export type PostDoc = InferSchemaType<typeof postSchema> & { _id: Types.ObjectId };
export const Post = model<PostDoc>("Post", postSchema);

const postLogSchema = new Schema({
  postId: { type: ObjectId, required: true, index: true },
  workspaceId: { type: ObjectId, required: true },
  level: { type: String, enum: ["info", "warn", "error"], default: "info" },
  message: { type: String, required: true },
  platformResponse: Mixed,
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 },
});
export type PostLogDoc = InferSchemaType<typeof postLogSchema> & { _id: Types.ObjectId };
export const PostLog = model<PostLogDoc>("PostLog", postLogSchema);

// ---------- media ----------
const mediaSchema = new Schema(
  {
    workspaceId: { type: ObjectId, required: true },
    storageKey: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    filename: { type: String, required: true },
    mime: { type: String, required: true },
    kind: { type: String, enum: ["image", "video", "document"], required: true },
    sizeBytes: { type: Number, required: true },
    width: Number,
    height: Number,
    durationSec: Number,
    checksum: String,
    status: { type: String, enum: ["uploading", "ready", "failed"], default: "uploading" },
    folder: { type: String, default: "" },
    /** Kept in the library; otherwise eligible for cleanup 30 days after use. */
    inLibrary: { type: Boolean, default: true },
    uploadedBy: ObjectId,
    deleteAfter: Date,
  },
  { timestamps: true },
);
mediaSchema.index({ workspaceId: 1, createdAt: -1 });
export type MediaDoc = InferSchemaType<typeof mediaSchema> & { _id: Types.ObjectId };
export const Media = model<MediaDoc>("Media", mediaSchema);

// ---------- usage & audit ----------
const usageSchema = new Schema({
  workspaceId: { type: ObjectId, required: true },
  month: { type: String, required: true },
  postsPublished: { type: Number, default: 0 },
});
usageSchema.index({ workspaceId: 1, month: 1 }, { unique: true });
export type UsageDoc = InferSchemaType<typeof usageSchema> & { _id: Types.ObjectId };
export const Usage = model<UsageDoc>("Usage", usageSchema);

const auditLogSchema = new Schema({
  workspaceId: { type: ObjectId, required: true, index: true },
  actorId: ObjectId,
  action: { type: String, required: true },
  target: String,
  data: Mixed,
  at: { type: Date, default: Date.now },
});
export type AuditLogDoc = InferSchemaType<typeof auditLogSchema> & { _id: Types.ObjectId };
export const AuditLog = model<AuditLogDoc>("AuditLog", auditLogSchema);

/** Meta data-deletion requests, so users can check status by code. */
const deletionRequestSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    platformUserId: { type: String, required: true },
    channelsRemoved: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const DeletionRequest = model<InferSchemaType<typeof deletionRequestSchema>>(
  "DeletionRequest",
  deletionRequestSchema,
);

export { Types };
