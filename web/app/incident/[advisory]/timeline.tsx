import type { VersionRow, WhileLiveRow } from "@/lib/incident";
import type { ReactNode } from "react";
import { short, svcSlug } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Chip, ELEV } from "@/app/ui";

// The temporal window, drawn. Each affected version gets a bar from live_from to live_to
// (dashed edge when live_to is an upper bound). Each lockfile commit is a marker: inside the
// bar = in_window; outside but pinning a removed version = pinned_removed. Advisory published
// is the vertical line. A real time axis underneath. Server-rendered SVG, no client JS.

const W = 960;
const ROW = 34; // per version
const TOP = 30; // room for the "advisory published" label
const AXIS = 22; // axis line + tick labels
const BAR = 12;
const GUT = 96; // left gutter for version labels
const MONO = "ui-monospace, monospace";
// Tick steps in seconds; the first that yields < 8 ticks over the span wins.
const STEPS = [10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800, 1209600];

export function Timeline({
  rows,
  versions,
  advisoryPublished,
}: {
  rows: WhileLiveRow[];
  versions: VersionRow[];
  advisoryPublished: number;
}) {
  const bounded = versions.filter((v) => v.live_to < 4_000_000_000);
  if (bounded.length === 0) return null;
  const t0 = Math.min(...bounded.map((v) => v.live_from), ...rows.map((r) => r.resolved_at));
  const t1 = Math.max(...bounded.map((v) => v.live_to), ...rows.map((r) => r.resolved_at), advisoryPublished);
  const span = Math.max(t1 - t0, 60);
  const pad = span * 0.04;
  const lo = t0 - pad;
  const hi = t1 + pad;
  const x = (t: number) => GUT + ((t - lo) / (hi - lo)) * (W - GUT);
  const H = TOP + bounded.length * ROW + AXIS;
  const axisY = TOP + bounded.length * ROW + 2;

  const step = STEPS.find((s) => (hi - lo) / s < 8) ?? Math.ceil((hi - lo) / 8 / 86400) * 86400;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  const dateMode = hi - lo > 2 * 86400;
  const tickLabel = (t: number) => (dateMode || t % 86400 === 0 ? isoDate(t) : step < 60 ? isoTime(t, true) : isoTime(t));

  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border bg-card/70 p-3", ELEV)}>
      {/* Bars draw left→right once (stroke-dashoffset over pathLength=1), markers fade in after them.
          The global reduced-motion rule collapses these durations to ~0. */}
      <style>{`@keyframes tl-draw{from{stroke-dashoffset:1;fill-opacity:0}to{stroke-dashoffset:0;fill-opacity:.35}}
@keyframes tl-fade{from{opacity:0}to{opacity:1}}
.tl-bar{stroke-dasharray:1;animation:tl-draw .6s ease-out both}
.tl-tick{animation:tl-fade .3s ease-out both;cursor:default}
.tl-tick .tl-mk{stroke:transparent;stroke-width:1.5;transition:stroke .15s}
.tl-tick:hover .tl-mk{stroke:var(--color-foreground)}`}</style>
      {/* min-w keeps the axis legible on narrow screens: the card scrolls instead of the SVG shrinking */}
      <div className="min-w-[640px]">
      <div className="mb-1 flex justify-between font-mono text-[10px] text-muted-foreground" style={{ paddingLeft: `${(GUT / W) * 100}%` }}>
        <span className="num">{iso(lo)}</span>
        <span className="num">{spanLabel(hi - lo)} shown</span>
        <span className="num">{iso(hi)}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`temporal window timeline: ${bounded.length} affected versions, ${rows.length} lockfile commits, ${spanLabel(hi - lo)} shown`}
      >
        {/* time axis: faint gridlines through the rows, tick marks and labels below */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={TOP - 6} y2={axisY} stroke="var(--color-border)" strokeOpacity={0.7} />
            <line x1={x(t)} x2={x(t)} y1={axisY} y2={axisY + 4} stroke="var(--color-muted-foreground)" />
            <text x={x(t)} y={axisY + 14} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="10" fontFamily={MONO}>
              {tickLabel(t)}
            </text>
          </g>
        ))}
        <line x1={GUT} x2={W} y1={axisY} y2={axisY} stroke="var(--color-border)" />
        {/* advisory published */}
        <line x1={x(advisoryPublished)} x2={x(advisoryPublished)} y1={10} y2={axisY} stroke="var(--color-muted-foreground)" strokeDasharray="3 3" />
        <text
          x={x(advisoryPublished) + 4}
          y={16}
          fill="var(--color-muted-foreground)"
          fontSize="10"
          fontFamily={MONO}
          textAnchor={x(advisoryPublished) > W * 0.8 ? "end" : "start"}
          dx={x(advisoryPublished) > W * 0.8 ? -8 : 0}
        >
          advisory published
        </text>
        {bounded.map((v, i) => {
          const y = TOP + i * ROW + 12;
          const ub = v.live_to_kind === "upper_bound";
          const marks = groupTicks(rows.filter((r) => r.version === v.version));
          return (
            <g key={v.version}>
              <text x={0} y={y + BAR / 2 + 3.5} fill="var(--color-foreground)" fontSize="10" fontFamily={MONO}>
                {trunc(short(v.version), 15)}
              </text>
              <rect
                className="tl-bar"
                pathLength={1}
                style={{ animationDelay: `${i * 80}ms` }}
                x={x(v.live_from)}
                y={y}
                width={Math.max(x(v.live_to) - x(v.live_from), 4)}
                height={BAR}
                rx={3}
                fill="var(--color-signal)"
                fillOpacity={0.35}
                stroke="var(--color-signal)"
                strokeOpacity={0.6}
                strokeWidth={1}
              />
              <line x1={x(v.live_from)} x2={x(v.live_from)} y1={y - 2} y2={y + BAR + 2} stroke="var(--color-signal)" strokeWidth={2} />
              <line
                x1={x(v.live_to)}
                x2={x(v.live_to)}
                y1={y - 2}
                y2={y + BAR + 2}
                stroke="var(--color-signal)"
                strokeWidth={2}
                strokeDasharray={ub ? "2 2" : undefined}
              />
              {marks.map((m, j) => {
                const cx = x(m.at);
                const tone = m.inWin ? "var(--color-l1)" : "var(--color-l2)";
                return (
                  <g key={j} className="tl-tick" style={{ animationDelay: `${600 + i * 80 + j * 60}ms` }}>
                    <line x1={cx} x2={cx} y1={y - 1} y2={y + BAR + 1} stroke={tone} strokeWidth={1.5} />
                    <polygon className="tl-mk" points={`${cx - 4.5},${y - 9} ${cx + 4.5},${y - 9} ${cx},${y - 1.5}`} fill={tone} strokeLinejoin="round" />
                    {m.rows.length > 1 && (
                      <text x={cx + 6} y={y - 2} fill={tone} fontSize="9" fontFamily={MONO}>
                        ×{m.rows.length}
                      </text>
                    )}
                    <title>{m.rows.map((r) => `${svcSlug(r.service)} · ${r.sha.slice(0, 12)} · ${iso(r.resolved_at)} · ${r.evidence}`).join("\n")}</title>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="legend">
        <Key swatch={<span className="block h-2 w-5 rounded-sm bg-signal/35 ring-1 ring-signal/60" />}>installable window</Key>
        <Key swatch={<span className="block h-3 w-0.5 bg-signal" />}>exact edge</Key>
        <Key swatch={<span className="block h-3 w-0.5 border-l-2 border-dashed border-signal" />}>upper bound · npm publishes no takedown time</Key>
        <Key swatch={<Tri className="text-l1" />}>lockfile commit in window</Key>
        <Key swatch={<Tri className="text-l2" />}>pins a removed version</Key>
        <Key swatch={<span className="block h-3 w-0.5 border-l border-dashed border-muted-foreground" />}>advisory published</Key>
      </ul>
    </div>
  );
}

// Commits at the identical second with the same evidence collapse into one marker (×n) —
// two overlapping triangles would hide each other and lie about the count.
function groupTicks(rows: WhileLiveRow[]) {
  const m = new Map<string, { at: number; inWin: boolean; rows: WhileLiveRow[] }>();
  for (const r of rows) {
    const inWin = r.evidence.includes("in_window");
    const k = `${r.resolved_at}|${inWin}`;
    (m.get(k) ?? m.set(k, { at: r.resolved_at, inWin, rows: [] }).get(k)!).rows.push(r);
  }
  return [...m.values()];
}

function Tri({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 10 8" className={cn("h-2 w-2.5", className)} aria-hidden>
      <polygon points="0,0 10,0 5,8" fill="currentColor" />
    </svg>
  );
}

function Key({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li>
      <Chip>
        <span className="inline-flex w-5 justify-center" aria-hidden>
          {swatch}
        </span>
        {children}
      </Chip>
    </li>
  );
}

const spanLabel = (s: number) =>
  s < 120 ? `${Math.round(s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : s < 2 * 86400 ? `${Math.round((s / 3600) * 10) / 10} h` : `${Math.round((s / 86400) * 10) / 10} d`;
const iso = (t: number) => new Date(t * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
const isoDate = (t: number) => new Date(t * 1000).toISOString().slice(5, 10); // MM-DD
const isoTime = (t: number, secs = false) => new Date(t * 1000).toISOString().slice(11, secs ? 19 : 16); // HH:MM[:SS]
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
