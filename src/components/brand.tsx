import { cn } from "@/lib/utils";

// The bloom icon is used only as the favicon (src/app/icon.svg, apple-icon.tsx).
// Everywhere else the brand is the wordmark alone.

/** Wordmark, "the echo": the first "a" is the message, the lighter second "a" its echo. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-wordmark text-[26px] leading-none font-extrabold tracking-[-0.045em]", className)} aria-label="Prasaar">
      <span aria-hidden="true">
        pras<span className="text-brand">a</span>
        <span className="text-brand opacity-45">a</span>r
      </span>
    </span>
  );
}

/** Just the echo, "aa": for tight spots like the collapsed sidebar. */
export function EchoMonogram({ className }: { className?: string }) {
  return (
    <span className={cn("font-wordmark text-[26px] leading-none font-extrabold tracking-[-0.06em]", className)} aria-label="Prasaar">
      <span aria-hidden="true">
        <span className="text-brand">a</span>
        <span className="text-brand opacity-45">a</span>
      </span>
    </span>
  );
}

export const Logo = Wordmark;
