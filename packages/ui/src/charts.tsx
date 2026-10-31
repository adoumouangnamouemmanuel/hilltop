"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Table2 } from "lucide-react";
import { cn } from "./ui";

/*
 * Small, dependency-free SVG charts. Single series in the --chart colour, hairline
 * solid gridlines, 2px lines over a 10% wash, columns capped at 24px with 4px
 * rounded tops, a hover/keyboard crosshair with a tooltip, and a table view.
 */

export type Point = { x: number; y: number };

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Rounded ticks from 0 to just above the max, e.g. 0 / 50 / 100 / 150. */
export function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

type ChartProps = {
  points: Point[];
  /** Formats values in ticks, tooltips and the table. */
  format?: (v: number) => string;
  label: string;
  height?: number;
};

const PAD = { top: 12, right: 12, bottom: 26, left: 40 };

function Frame({ label, children, table }: { label: string; children: React.ReactNode; table: React.ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowTable((t) => !t)}
          aria-pressed={showTable}
          className="-mt-1 mb-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-ink-500 hover:bg-surface hover:text-ink-950"
        >
          <Table2 className="size-3.5" aria-hidden /> {showTable ? "Show chart" : "View as table"}
        </button>
      </div>
      {showTable ? (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-line">{table}</div>
      ) : (
        <figure aria-label={label}>{children}</figure>
      )}
    </div>
  );
}

function DataTable({ points, format, label }: Required<Pick<ChartProps, "points" | "format" | "label">>) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{label}</caption>
      <thead className="sticky top-0 bg-elevated text-left text-xs text-ink-500">
        <tr>
          <th className="px-3 py-2 font-medium">Date</th>
          <th className="px-3 py-2 text-right font-medium">Value</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {points.map((p) => (
          <tr key={p.x}>
            <td className="px-3 py-1.5 text-ink-700">{shortDate.format(p.x)}</td>
            <td className="px-3 py-1.5 text-right text-ink-950 tabular">{format(p.y)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tooltip({ x, y, width, point, format }: { x: number; y: number; width: number; point: Point; format: (v: number) => string }) {
  // Keep the tooltip inside the chart.
  const left = Math.min(Math.max(x, 60), width - 60);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink-950 px-2.5 py-1.5 text-center text-xs whitespace-nowrap text-canvas shadow-pop"
      style={{ left, top: y - 10 }}
    >
      <div className="font-semibold">{format(point.y)}</div>
      <div className="text-[10px] opacity-70">{shortDate.format(point.x)}</div>
    </motion.div>
  );
}

function Axes({
  ticks,
  scaleY,
  width,
  height,
  format,
}: {
  ticks: number[];
  scaleY: (v: number) => number;
  width: number;
  height: number;
  format: (v: number) => string;
}) {
  return (
    <g aria-hidden>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={width - PAD.right} y1={scaleY(t)} y2={scaleY(t)} className="stroke-line" strokeWidth={1} />
          <text x={PAD.left - 8} y={scaleY(t)} dy="0.32em" textAnchor="end" className="fill-ink-500 text-[10px] tabular">
            {format(t)}
          </text>
        </g>
      ))}
      <line
        x1={PAD.left}
        x2={width - PAD.right}
        y1={height - PAD.bottom}
        y2={height - PAD.bottom}
        className="stroke-line-strong"
        strokeWidth={1}
      />
    </g>
  );
}

function XLabels({ points, scaleX, height }: { points: Point[]; scaleX: (i: number) => number; height: number }) {
  if (!points.length) return null;
  const idx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return (
    <g aria-hidden>
      {idx.map((i, k) => (
        <text
          key={i}
          x={scaleX(i)}
          y={height - 8}
          textAnchor={k === 0 ? "start" : k === idx.length - 1 ? "end" : "middle"}
          className="fill-ink-500 text-[10px]"
        >
          {shortDate.format(points[i].x)}
        </text>
      ))}
    </g>
  );
}

/** Keyboard support: arrow keys move the highlighted point. */
function useActive(count: number) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setActive((a) => Math.min(count - 1, (a ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? count) - 1));
    else if (e.key === "Escape") setActive(null);
  };
  return { active, setActive, onKeyDown };
}

export function AreaChart({ points, format = (v) => compact.format(v), label, height = 220 }: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const gradient = useId();
  const max = Math.max(0, ...points.map((p) => p.y));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const scaleX = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2);
  const scaleY = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const { active, setActive, onKeyDown } = useActive(points.length);

  const line = points.map((p, i) => `${i ? "L" : "M"}${scaleX(i)},${scaleY(p.y)}`).join(" ");
  const area = points.length ? `${line} L${scaleX(points.length - 1)},${scaleY(0)} L${scaleX(0)},${scaleY(0)} Z` : "";

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * width;
    const i = Math.round(((x - PAD.left) / innerW) * (points.length - 1));
    setActive(Math.min(points.length - 1, Math.max(0, i)));
  }

  return (
    <Frame label={label} table={<DataTable points={points} format={format} label={label} />}>
      <div ref={ref} className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={label}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          className="touch-pan-y overflow-visible rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-maroon-600"
        >
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--chart)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Axes ticks={ticks} scaleY={scaleY} width={width} height={height} format={format} />
          <XLabels points={points} scaleX={scaleX} height={height} />
          <motion.path
            d={area}
            fill={`url(#${gradient})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          />
          <motion.path
            d={line}
            fill="none"
            stroke="var(--chart)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          />
          {active !== null && points[active] && (
            <g aria-hidden>
              <line
                x1={scaleX(active)}
                x2={scaleX(active)}
                y1={PAD.top}
                y2={height - PAD.bottom}
                className="stroke-ink-400"
                strokeWidth={1}
              />
              <circle
                cx={scaleX(active)}
                cy={scaleY(points[active].y)}
                r={5}
                fill="var(--chart)"
                stroke="var(--elevated)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
        <AnimatePresence>
          {active !== null && points[active] && (
            <Tooltip key="tip" x={scaleX(active)} y={scaleY(points[active].y)} width={width} point={points[active]} format={format} />
          )}
        </AnimatePresence>
      </div>
    </Frame>
  );
}

export function ColumnChart({ points, format = (v) => compact.format(v), label, height = 220 }: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const max = Math.max(0, ...points.map((p) => p.y));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, points.length);
  // Columns never fill the slot: capped at 24px, with at least a 2px gap between them.
  const barW = Math.max(2, Math.min(24, band - 2));
  const scaleX = (i: number) => PAD.left + band * i + band / 2;
  const scaleY = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const { active, setActive, onKeyDown } = useActive(points.length);
  const r = Math.min(4, barW / 2);

  return (
    <Frame label={label} table={<DataTable points={points} format={format} label={label} />}>
      <div ref={ref} className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={label}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerLeave={() => setActive(null)}
          className="touch-pan-y overflow-visible rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-maroon-600"
        >
          <Axes ticks={ticks} scaleY={scaleY} width={width} height={height} format={format} />
          <XLabels points={points} scaleX={scaleX} height={height} />
          {points.map((p, i) => {
            const h = Math.max(0, scaleY(0) - scaleY(p.y));
            const x = scaleX(i) - barW / 2;
            const y = scaleY(0) - h;
            // Rounded top corners, square at the baseline.
            const d =
              h <= 0
                ? ""
                : `M${x},${scaleY(0)} V${y + Math.min(r, h)} Q${x},${y} ${x + Math.min(r, h)},${y} H${x + barW - Math.min(r, h)} Q${x + barW},${y} ${x + barW},${y + Math.min(r, h)} V${scaleY(0)} Z`;
            return (
              <g key={p.x} onPointerEnter={() => setActive(i)}>
                {/* Hit area larger than the mark. */}
                <rect x={scaleX(i) - band / 2} y={PAD.top} width={band} height={innerH} fill="transparent" />
                {d && (
                  <motion.path
                    d={d}
                    fill="var(--chart)"
                    opacity={active === null || active === i ? 1 : 0.45}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    style={{ transformOrigin: `0px ${scaleY(0)}px`, transformBox: "view-box" }}
                    transition={{ duration: 0.5, delay: Math.min(i, 30) * 0.012, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
              </g>
            );
          })}
        </svg>
        <AnimatePresence>
          {active !== null && points[active] && (
            <Tooltip key="tip" x={scaleX(active)} y={scaleY(points[active].y)} width={width} point={points[active]} format={format} />
          )}
        </AnimatePresence>
      </div>
    </Frame>
  );
}

/** Tiny trend line for stat tiles. Decorative; the tile's number carries the value. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const w = 96;
  const h = 28;
  const max = Math.max(1, ...values);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i / Math.max(1, values.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={cn("overflow-visible", className)} aria-hidden>
      <path d={d} fill="none" className="stroke-ink-300" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {values.length > 0 && <circle cx={w} cy={h - 2 - (values[values.length - 1] / max) * (h - 4)} r={2.5} fill="var(--chart)" />}
    </svg>
  );
}

/** Horizontal bar for funnels and rankings: the track is a lighter step of the same colour. */
export function Meter({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max ? Math.max(value ? 2 : 0, (value / max) * 100) : 0;
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--chart)_14%,transparent)]", className)} aria-hidden>
      <motion.div
        className="h-full rounded-full bg-[var(--chart)]"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

export { compact as compactNumber };
