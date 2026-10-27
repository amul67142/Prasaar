import Link from "next/link";
import { Logo } from "@/components/brand";

const POINTS = [
  { title: "Up and running in minutes", body: "Connect your accounts once, then plan and schedule posts for every platform from one place." },
  { title: "Every channel, one calendar", body: "Facebook Pages, Instagram, LinkedIn, Telegram, Bluesky and Mastodon, with more on the way." },
  { title: "Built for teams and agencies", body: "A workspace per brand or client, roles for your team, and times in IST by default." },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-br from-background via-background to-muted/60">
      <header className="px-6 pt-8 sm:px-12 lg:px-20">
        <Link href="/" aria-label="Prasaar home">
          <Logo className="text-[34px]" />
        </Link>
      </header>
      <main className="flex flex-1 items-center px-6 py-10 sm:px-12 lg:px-20">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
          <ul className="hidden max-w-lg space-y-12 lg:block">
            {POINTS.map((p) => (
              <li key={p.title} className="border-l-[3px] border-brand pl-6">
                <p className="text-lg font-semibold">{p.title}</p>
                <p className="mt-2 text-[17px] leading-relaxed text-muted-foreground">{p.body}</p>
              </li>
            ))}
          </ul>
          <div className="w-full">{children}</div>
        </div>
      </main>
      <footer className="px-6 pb-6 text-sm text-muted-foreground sm:px-12 lg:px-20">
        <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy</Link> ·{" "}
        <Link href="/terms" className="underline-offset-4 hover:underline">Terms</Link>      </footer>
    </div>
  );
}
