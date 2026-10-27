// Client-safe role checks, so the UI can hide what the server would refuse anyway.

export type Role = "owner" | "admin" | "editor" | "approver" | "viewer";

export type Action =
  | "post:write"
  | "post:publish"
  | "post:approve"
  | "channel:manage"
  | "media:write"
  | "team:manage"
  | "workspace:manage";

const GRANTS: Record<Role, Action[]> = {
  owner: ["post:write", "post:publish", "post:approve", "channel:manage", "media:write", "team:manage", "workspace:manage"],
  admin: ["post:write", "post:publish", "post:approve", "channel:manage", "media:write", "team:manage", "workspace:manage"],
  editor: ["post:write", "post:publish", "media:write"],
  approver: ["post:approve"],
  viewer: [],
};

export function can(role: Role, action: Action): boolean {
  return GRANTS[role].includes(action);
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  approver: "Approver",
  viewer: "Viewer",
};
