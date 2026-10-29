"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const H = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 52 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = Math.max(1, Math.round(Math.abs(min) * 0.05));
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1000) / 1000);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

const fmt = (n: number) => n.toLocaleString("en-IN");
const fmtShort = (n: number) => (Math.abs(n) >= 1e5 ? `${(n / 1e5).toFixed(n % 1e5 ? 1 : 0)}L` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(n % 1e3 ? 1 : 0)}k` : String(n));
const dayLabel = (d: string, withYear = false) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });

/** One series: total followers per day. Crosshair + tooltip on hover, arrow keys when focused. */
export function FollowersChart({ points }: { points: { day: string; value: number }[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const values = points.map((p) => p.value);
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const innerW = width - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - ((v - lo) / (hi - lo || 1)) * innerH;
    const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    return { ticks, x, y, path, innerW };
  }, [points, width]);

  const labelIdx = points.length <= 2 ? points.map((_, i) => i) : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const a = active != null ? points[active] : null;

  const pick = (clientX: number) => {
    const box = wrap.current!.getBoundingClientRect();
    const rel = clientX - box.left - PAD.left;
    const i = points.length === 1 ? 0 : Math.round((rel / geo.innerW) * (points.length - 1));
    setActive(Math.max(0, Math.min(points.length - 1, i)));
  };

  return (
    <div ref={wrap} className="relative select-none">
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`Total followers from ${dayLabel(points[0].day)} to ${dayLabel(points[points.length - 1].day)}: ${fmt(points[0].value)} to ${fmt(points[points.length - 1].value)}`}
        tabIndex={0}
        className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((v) => v ?? points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setActive((v) => Math.max(0, (v ?? points.length) - 1));
          else if (e.key === "ArrowRight") setActive((v) => Math.min(points.length - 1, (v ?? -1) + 1));
          else return;
          e.preventDefault();
        }}
      >
        {geo.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(t)} y2={geo.y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 8} y={geo.y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {fmtShort(t)}
            </text>
          </g>
        ))}
        {labelIdx.map((i) => (
          <text
            key={i}
            x={geo.x(i)}
            y={H - 8}
            textAnchor={points.length > 1 && i === 0 ? "start" : points.length > 1 && i === points.length - 1 ? "end" : "middle"}
            className="fill-muted-foreground text-[11px]"
          >
            {dayLabel(points[i].day)}
          </text>
        ))}
        <path d={geo.path} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.length === 1 ? <circle cx={geo.x(0)} cy={geo.y(points[0].value)} r={4} fill="var(--brand)" /> : null}
        {a ? (
          <g pointerEvents="none">
            <line x1={geo.x(active!)} x2={geo.x(active!)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-muted-foreground/60" strokeWidth={1} />
            <circle cx={geo.x(active!)} cy={geo.y(a.value)} r={4.5} fill="var(--brand)" className="stroke-background" strokeWidth={2} />
          </g>
        ) : null}
      </svg>
      {a ? (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md"
          style={{ left: Math.min(Math.max(geo.x(active!) - 70, 0), width - 150), width: 140 }}
        >
          <p className="text-xs text-muted-foreground">{dayLabel(a.day, true)}</p>
          <p className="font-semibold tabular-nums">{fmt(a.value)}</p>
        </div>
      ) : null}
    </div>
  );
}
