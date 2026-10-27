import Link from "next/link";

export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 font-semibold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-lg bg-orange-500 text-sm font-bold text-white">प्र</span>
        Prasaar
      </Link>
      <article className="space-y-4 text-[15px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_a]:underline">
        {children}
      </article>
      <p className="mt-12 text-sm text-muted-foreground">
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/data-deletion">Data deletion</Link>
      </p>
    </div>
  );
}
