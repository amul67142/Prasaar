// Local development has no QStash or Vercel Cron, so run the sweep in-process.
// Production uses QStash jobs plus the per-minute cron (vercel.json) instead.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const wanted = process.env.LOCAL_TICKER ?? (process.env.NODE_ENV === "development" && !process.env.QSTASH_TOKEN ? "1" : "0");
  if (wanted !== "1" || !process.env.MONGODB_URI) return;

  const g = globalThis as unknown as { __prasaarTicker?: NodeJS.Timeout };
  if (g.__prasaarTicker) return;
  const { sweep } = await import("./lib/engine");
  let running = false;
  g.__prasaarTicker = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const res = await sweep();
      if (res.ran || res.interrupted) console.info("[ticker]", res);
    } catch (err) {
      console.error("[ticker]", err);
    } finally {
      running = false;
    }
  }, 15_000);
  console.info("[ticker] local publish sweep every 15s");
}
