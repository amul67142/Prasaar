import Link from "next/link";
import { Bot, CalendarDays, Clock, IndianRupee, PenLine, RotateCw, Users } from "lucide-react";
import { Logo } from "@/components/brand";
import { Glyph, PlatformIcon, UPCOMING } from "@/components/platform-icon";
import { Button } from "@/components/ui/button";
import { PLATFORMS, PLATFORM_INFO, type Platform } from "@/lib/platforms/catalog";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#platforms", label: "Platforms" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

const FEATURES = [
  {
    icon: PenLine,
    title: "Write once, fit every platform",
    body: "One composer for all your accounts. Change the text for LinkedIn or Instagram when you want to, and see character limits and media rules checked as you type.",
  },
  {
    icon: CalendarDays,
    title: "A calendar your team shares",
    body: "Month, week and day views. Drag a post to a new day to move it. Filter by account or status to see what's going out.",
  },
  {
    icon: Clock,
    title: "Queue with posting times",
    body: "Set weekly times for each account. Add a post to the queue and it takes the next free slot, in IST by default.",
  },
  {
    icon: Users,
    title: "Workspaces and roles",
    body: "A workspace per brand or client, with owners, admins, editors and viewers. One login moves between all of them.",
  },
  {
    icon: RotateCw,
    title: "Publishing you can trust",
    body: "Posts go out on time, retry on their own when a platform is busy, and never post twice. If something fails, you get an email in plain words.",
  },
  {
    icon: IndianRupee,
    title: "Made for India",
    body: "IST scheduling, Hindi coming soon, and pricing in rupees. UPI, cards and GST invoices arrive with billing, coming soon.",
  },
];

const PRO_TIERS = [
  { range: "Accounts 1–5", monthly: "₹249", yearly: "₹199" },
  { range: "Accounts 6–20", monthly: "₹129", yearly: "₹99" },
  { range: "Accounts 21+", monthly: "₹49", yearly: "₹39" },
];

const FAQ = [
  {
    q: "Which platforms can I post to?",
    a: "Facebook Pages, Instagram (Business and Creator), LinkedIn, YouTube, Telegram, Bluesky and Mastodon today. Threads, X, Google Business Profile, TikTok and Pinterest follow.",
  },
  {
    q: "Is my data stored in India?",
    a: "Yes. Our database and servers run in Mumbai. Account logins from each platform are encrypted, and we only use them to publish the posts you schedule.",
  },
  {
    q: "How does billing work?",
    a: "You pay per connected account each month, and the price per account drops as you add more. Prices are in rupees plus 18% GST. Paid plans with UPI, cards and GST invoices are coming soon; until then, Prasaar is free to use.",
  },
  {
    q: "Can I manage accounts for my clients?",
    a: "Yes. Create a workspace for each client, invite your team with the right role, and switch between clients from one login.",
  },
  {
    q: "Can I cancel any time?",
    a: "Yes. There's no lock-in. When paid plans launch, your plan stays active until the end of the period you paid for.",
  },
  {
    q: "Is there an API?",
    a: "A REST API and an MCP server for AI assistants are coming in our next release, so scripts, n8n, Make and tools like Claude can schedule posts for you.",
  },
];

const PREVIEW: { day: number; items: { time: string; text: string; platforms: Platform[] }[] }[] = [
  { day: 3, items: [{ time: "9:00", text: "Diwali offer", platforms: ["instagram", "facebook"] }] },
  { day: 5, items: [{ time: "11:30", text: "Site visit open", platforms: ["linkedin"] }] },
  { day: 9, items: [{ time: "18:00", text: "New flats tour", platforms: ["instagram"] }, { time: "19:00", text: "Channel update", platforms: ["telegram"] }] },
  { day: 12, items: [{ time: "10:00", text: "Client story", platforms: ["linkedin", "bluesky"] }] },
];

// Drawn rather than the 🇮🇳 emoji, which Windows shows as the letters "IN".
function IndianFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 20" className={className} role="img" aria-label="Indian flag">
      <rect width="30" height="20" fill="#FFFFFF" />
      <rect width="30" height="6.67" fill="#FF9933" />
      <rect y="13.33" width="30" height="6.67" fill="#138808" />
      <g stroke="#000080" fill="none">
        <circle cx="15" cy="10" r="2.9" strokeWidth="0.55" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 12;
          return <line key={i} x1={15 - 2.9 * Math.cos(a)} y1={10 - 2.9 * Math.sin(a)} x2={15 + 2.9 * Math.cos(a)} y2={10 + 2.9 * Math.sin(a)} strokeWidth="0.25" />;
        })}
      </g>
      <circle cx="15" cy="10" r="0.6" fill="#000080" />
    </svg>
  );
}

function ProductPreview() {
  const days = Array.from({ length: 14 }, (_, i) => i + 1);
  return (
    <div className="relative rounded-3xl border bg-background p-4 shadow-xl shadow-black/5 sm:p-5" aria-hidden="true">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-display text-lg font-bold">November 2026</p>
          <p className="text-xs text-muted-foreground">6 posts scheduled · 4 accounts</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-xs">
          <span className="rounded-md px-2 py-1 text-muted-foreground">Week</span>
          <span className="rounded-md bg-background px-2 py-1 font-medium shadow-xs">Month</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-[11px]">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="pb-1 text-center font-medium text-muted-foreground">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const cell = PREVIEW.find((p) => p.day === d);
          return (
            <div key={d} className={cn("min-h-16 rounded-lg border p-1.5 sm:min-h-20", d === 9 && "border-brand/50 bg-brand-soft")}>
              <span className={cn("text-[11px] text-muted-foreground", d === 9 && "font-semibold text-foreground")}>{d}</span>
              <div className="mt-1 space-y-1">
                {cell?.items.map((it) => (
                  <div key={it.text} className="rounded-md bg-muted px-1 py-0.5">
                    <div className="flex gap-0.5">
                      {it.platforms.map((p) => (
                        <PlatformIcon key={p} platform={p} size="xs" />
                      ))}
                    </div>
                    <p className="mt-0.5 hidden truncate leading-tight sm:block">
                      {it.time} {it.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute -bottom-5 left-6 hidden items-center gap-2 rounded-xl border bg-background px-3 py-2 text-xs shadow-lg sm:flex">
        <span className="size-2 rounded-full bg-emerald-500" />
        Published to Instagram and Facebook · 9:00 AM
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Prasaar home">
            <Logo className="text-[28px]" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-foreground">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="hidden sm:inline-flex" render={<Link href="/login" />}>
              Log in
            </Button>
            <Button render={<Link href="/signup" />}>Start free</Button>
            <details className="relative md:hidden">
              <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label="Menu">
                <span className="flex w-4 flex-col gap-1">
                  <span className="h-0.5 rounded bg-foreground" />
                  <span className="h-0.5 rounded bg-foreground" />
                  <span className="h-0.5 rounded bg-foreground" />
                </span>
              </summary>
              <div className="absolute right-0 mt-2 flex w-48 flex-col rounded-xl border bg-background p-2 text-sm shadow-lg">
                {NAV.map((n) => (
                  <a key={n.href} href={n.href} className="rounded-lg px-3 py-2 hover:bg-muted">
                    {n.label}
                  </a>
                ))}
                <Link href="/login" className="rounded-lg px-3 py-2 hover:bg-muted">
                  Log in
                </Link>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-sm text-muted-foreground">
              <IndianFlag className="h-3 w-[18px] rounded-[2px] ring-1 ring-black/10" />
              Made in India
            </p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-[56px] lg:leading-[1.05]">
              Plan a month of posts in an afternoon. Publish everywhere, on time.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
              Prasaar schedules posts to Facebook, Instagram, LinkedIn, YouTube, Telegram, Bluesky and Mastodon from one calendar, for Indian creators, businesses and the agencies that
              run them.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="h-11 px-5 text-[15px]" render={<Link href="/signup" />}>
                Create a free account
              </Button>
              <Button size="lg" variant="outline" className="h-11 px-5 text-[15px]" render={<Link href="/login" />}>
                Log in
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Free for up to 3 accounts. No card needed.</p>
          </div>
          <ProductPreview />
        </section>

        <section id="platforms" className="scroll-mt-20 border-y bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <p className="mb-6 text-center text-sm font-medium text-muted-foreground">Post to the platforms your audience uses</p>
            <ul className="flex flex-wrap justify-center gap-3">
              {PLATFORMS.map((p) => (
                <li key={p} className="flex items-center gap-2 rounded-full border bg-background py-1.5 pr-4 pl-1.5 text-sm">
                  <PlatformIcon platform={p} size="md" /> {PLATFORM_INFO[p].label}
                </li>
              ))}
              {UPCOMING.map((u) => (
                <li key={u.key} className="flex items-center gap-2 rounded-full border border-dashed py-1.5 pr-4 pl-1.5 text-sm text-muted-foreground">
                  <span className="flex size-6 items-center justify-center rounded-md bg-muted-foreground/30 text-white">
                    <Glyph path={u.path} className="size-3.5" />
                  </span>
                  {u.label}
                  <span className="text-xs">· Coming soon</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Everything to run your social calendar</h2>
            <p className="mt-3 text-lg text-muted-foreground">From the first draft to the published link, in one place your whole team can use.</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border bg-background p-6">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl bg-primary p-8 text-primary-foreground sm:p-10">
              <p className="text-sm font-medium text-brand">For agencies</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">Every client in one login</h2>
              <p className="mt-3 text-primary-foreground/75">
                Give each brand its own workspace with its own accounts, calendar and team. Editors write, owners approve, clients see only their own work. Pay less per
                account the more you manage.
              </p>
              <Button variant="secondary" className="mt-6" render={<Link href="/signup" />}>
                Set up your agency
              </Button>
            </div>
            <div className="rounded-3xl border bg-muted/40 p-8 sm:p-10">
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Bot className="size-4" /> API &amp; AI agents · Coming soon
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">Let your tools post for you</h2>
              <p className="mt-3 text-muted-foreground">
                A REST API for scripts, n8n and Make, and an MCP server so assistants like Claude and Cursor can draft and schedule posts when you ask them to.
              </p>
              <pre className="mt-6 overflow-x-auto rounded-xl bg-background p-4 text-xs leading-relaxed text-muted-foreground">
                <code>{`POST /v1/posts
{ "content": "Site visits open this Sunday",
  "channelIds": ["ch_123"],
  "scheduledAt": "2026-11-01T04:30:00Z" }`}</code>
              </pre>
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Simple pricing, in rupees</h2>
              <p className="mt-3 text-lg text-muted-foreground">Pay per connected account. The more accounts you add, the less each one costs.</p>
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              <div className="flex flex-col rounded-2xl border bg-background p-6">
                <h3 className="font-semibold">Free</h3>
                <p className="mt-3 font-display text-4xl font-bold">₹0</p>
                <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                  <li>Up to 3 accounts</li>
                  <li>20 posts a month</li>
                  <li>Schedule up to 30 days ahead</li>
                  <li>All live platforms</li>
                </ul>
                <Button variant="outline" className="mt-6 w-full" render={<Link href="/signup" />}>
                  Start free
                </Button>
              </div>
              <div className="flex flex-col rounded-2xl border-2 border-brand bg-background p-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Pro</h3>
                  <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">Per account, per month</span>
                </div>
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-normal">Accounts</th>
                      <th className="pb-2 font-normal">Monthly</th>
                      <th className="pb-2 font-normal">Yearly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PRO_TIERS.map((t) => (
                      <tr key={t.range} className="border-t">
                        <td className="py-2">{t.range.replace("Accounts ", "")}</td>
                        <td className="py-2 font-semibold">{t.monthly}</td>
                        <td className="py-2 text-muted-foreground">{t.yearly}/mo</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted-foreground">Tiers add up: 10 accounts = 5 × ₹249 + 5 × ₹129 = ₹1,890 a month.</p>
                <ul className="mt-4 mb-6 space-y-2 text-sm text-muted-foreground">
                  <li>Unlimited posts</li>
                  <li>Video up to 250 MB</li>
                </ul>
                <Button className="mt-auto w-full" render={<Link href="/signup" />}>
                  Start free, upgrade later
                </Button>
              </div>
              <div className="flex flex-col rounded-2xl border bg-background p-6">
                <h3 className="font-semibold">Agency</h3>
                <p className="mt-3 font-display text-4xl font-bold">Custom</p>
                <ul className="mt-5 mb-6 space-y-2 text-sm text-muted-foreground">
                  <li>Unlimited workspaces and accounts</li>
                  <li>Client approvals and portal (coming soon)</li>
                  <li>Your branding on client links (coming soon)</li>
                  <li>Priority support in Indian hours</li>
                </ul>
                <Button variant="outline" className="mt-auto w-full" render={<a href="#faq" />}>
                  Talk to us
                </Button>
              </div>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">Prices are introductory and exclude 18% GST. Paid plans and GST invoices are coming soon.</p>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Questions</h2>
          <div className="mt-8 divide-y rounded-2xl border bg-background">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="text-xl leading-none text-muted-foreground transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-brand-soft p-8 sm:flex-row sm:items-center sm:p-10">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Start posting smarter today</h2>
              <p className="mt-2 text-muted-foreground">Connect your first accounts in a few minutes.</p>
            </div>
            <Button size="lg" className="h-11 px-5 text-[15px]" render={<Link href="/signup" />}>
              Create a free account
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <Logo className="text-[22px]" />
            <span>© 2026 Prasaar</span>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/data-deletion" className="hover:text-foreground">Data deletion</Link>
            <Link href="/login" className="hover:text-foreground">Log in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
