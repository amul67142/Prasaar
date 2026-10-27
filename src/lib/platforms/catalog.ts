// Client-safe platform metadata. No secrets, no server imports.

export const PLATFORMS = ["facebook", "instagram", "linkedin", "telegram", "bluesky", "mastodon"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type ConnectMethod = "oauth" | "form";

export const PLATFORM_INFO: Record<
  Platform,
  { label: string; color: string; connect: ConnectMethod; connectHint: string }
> = {
  facebook: {
    label: "Facebook Page",
    color: "#1877F2",
    connect: "oauth",
    connectHint: "Log in with Facebook and pick the Pages to add.",
  },
  instagram: {
    label: "Instagram",
    color: "#E1306C",
    connect: "oauth",
    connectHint: "Business or Creator account linked to a Facebook Page.",
  },
  linkedin: {
    label: "LinkedIn",
    color: "#0A66C2",
    connect: "oauth",
    connectHint: "Your profile, and any company pages you admin.",
  },
  telegram: {
    label: "Telegram",
    color: "#229ED9",
    connect: "form",
    connectHint: "Add your bot as an admin of the channel or group, then paste its token.",
  },
  bluesky: {
    label: "Bluesky",
    color: "#0085FF",
    connect: "form",
    connectHint: "Use an app password from Settings → Privacy and security → App passwords.",
  },
  mastodon: {
    label: "Mastodon",
    color: "#6364FF",
    connect: "oauth",
    connectHint: "Enter your server (for example mastodon.social) and log in there.",
  },
};

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}
