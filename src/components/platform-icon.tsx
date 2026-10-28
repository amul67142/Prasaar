import { siBluesky, siFacebook, siInstagram, siMastodon, siPinterest, siTelegram, siThreads, siTiktok, siX, siYoutube } from "simple-icons";
import { cn } from "@/lib/utils";
import { PLATFORM_INFO, type Platform } from "@/lib/platforms/catalog";

/** Platforms on the roadmap (PRD phases 2–3), shown greyed out next to the live ones. */
export const UPCOMING = [
  { key: "threads", label: "Threads", path: siThreads.path, color: "#000000" },
  { key: "x", label: "X", path: siX.path, color: "#000000" },
  { key: "tiktok", label: "TikTok", path: siTiktok.path, color: "#000000" },
  { key: "pinterest", label: "Pinterest", path: siPinterest.path, color: "#BD081C" },
] as const;

// LinkedIn isn't in Simple Icons (removed at LinkedIn's request), so it's drawn as text.
const PATHS: Partial<Record<Platform, string>> = {
  facebook: siFacebook.path,
  instagram: siInstagram.path,
  telegram: siTelegram.path,
  bluesky: siBluesky.path,
  mastodon: siMastodon.path,
  youtube: siYoutube.path,
};

const SIZES = { xs: "size-4 rounded-[5px]", sm: "size-5 rounded-md", md: "size-6 rounded-md", lg: "size-12 rounded-xl" };
const GLYPH = { xs: "size-2.5", sm: "size-3", md: "size-3.5", lg: "size-7" };

export function Glyph({ path, className }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

/** Platform tile: white glyph on the platform colour (or grey when `muted`). */
export function PlatformIcon({
  platform,
  className,
  size = "md",
  muted,
}: {
  platform: Platform;
  className?: string;
  size?: keyof typeof SIZES;
  muted?: boolean;
}) {
  const path = PATHS[platform];
  const bg = platform === "instagram" && !muted ? "linear-gradient(45deg,#F58529,#DD2A7B 50%,#8134AF)" : muted ? undefined : PLATFORM_INFO[platform].color;
  return (
    <span
      role="img"
      aria-label={PLATFORM_INFO[platform].label}
      title={PLATFORM_INFO[platform].label}
      className={cn("inline-flex shrink-0 items-center justify-center text-white", SIZES[size], muted && "bg-muted-foreground/35", className)}
      style={bg ? { background: bg } : undefined}
    >
      {path ? (
        <Glyph path={path} className={GLYPH[size]} />
      ) : (
        <span className={cn("font-bold leading-none", size === "lg" ? "text-xl" : size === "xs" ? "text-[8px]" : "text-[10px]")}>in</span>
      )}
    </span>
  );
}

export function ChannelAvatar({
  platform,
  name,
  avatar,
  className,
}: {
  platform: Platform;
  name: string;
  avatar?: string;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex size-10 shrink-0", className)}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote platform avatars, any host
        <img src={avatar} alt="" className="size-full rounded-full bg-muted object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex size-full items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <PlatformIcon platform={platform} size="xs" className="absolute -right-1 -bottom-1 ring-2 ring-background" />
    </span>
  );
}
