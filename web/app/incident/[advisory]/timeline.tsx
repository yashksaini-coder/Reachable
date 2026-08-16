import type { VersionRow, WhileLiveRow } from "@/lib/incident";
import type { ReactNode } from "react";
import { short, svcSlug } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ELEV } from "@/app/ui";

// The temporal window, drawn. Each affected version gets a bar from live_from to live_to
// (dashed edge when live_to is an upper bound). Each lockfile commit is a tick: inside the
// bar = in_window; outside but pinning a removed version = pinned_removed. Advisory published
// is the vertical line. Server-rendered SVG, no client JS.

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
  const W = 960;
  const x = (t: number) => ((t - lo) / (hi - lo)) * W;
  const rowH = 26;
  const H = 40 + bounded.length * rowH + 4;
  const hours = Math.round(((hi - lo) / 3600) * 10) / 10;

  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border bg-card/70 p-3", ELEV)}>
      {/* Bars draw left→right once (stroke-dashoffset over pathLength=1), ticks fade in after them.
          The global reduced-motion rule collapses these durations to ~0. */}
      <style>{`@keyframes tl-draw{from{stroke-dashoffset:1;fill-opacity:0}to{stroke-dashoffset:0;fill-opacity:.35}}
@keyframes tl-fade{from{opacity:0}to{opacity:1}}
.tl-bar{stroke-dasharray:1;animation:tl-draw .6s ease-out both}
.tl-tick{animation:tl-fade .3s ease-out both}`}</style>
      <div className="mb-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span className="num">{iso(lo)}</span>
        <span>
          <span className="num">{hours}</span> h shown
        </span>
        <span className="num">{iso(hi)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`temporal window timeline: ${bounded.length} affected versions, ${rows.length} lockfile commits`}>
        {/* advisory published */}
        <line x1={x(advisoryPublished)} x2={x(advisoryPublished)} y1={8} y2={H - 4} stroke="var(--color-muted-foreground)" strokeDasharray="3 3" />
        <text x={x(advisoryPublished) + 4} y={16} fill="var(--color-muted-foreground)" fontSize="10" fontFamily="ui-monospace, monospace">
          advisory published
        </text>
        {bounded.map((v, i) => {
          const y = 34 + i * rowH;
          const ub = v.live_to_kind === "upper_bound";
          const ticks = rows.filter((r) => r.version === v.version);
          return (
            <g key={v.version}>
              <text x={0} y={y - 4} fill="var(--color-foreground)" fontSize="10" fontFamily="ui-monospace, monospace">
                {short(v.version)}
              </text>
              <rect
                className="tl-bar"
                pathLength={1}
                style={{ animationDelay: `${i * 80}ms` }}
                x={x(v.live_from)}
                y={y}
                width={Math.max(x(v.live_to) - x(v.live_from), 2)}
                height={10}
                fill="var(--color-signal)"
                fillOpacity={0.35}
                stroke="var(--color-signal)"
                strokeOpacity={0.6}
                strokeWidth={1}
              />
              <line x1={x(v.live_from)} x2={x(v.live_from)} y1={y - 2} y2={y + 12} stroke="var(--color-signal)" strokeWidth={2} />
              <line
                x1={x(v.live_to)}
                x2={x(v.live_to)}
                y1={y - 2}
                y2={y + 12}
                stroke="var(--color-signal)"
                strokeWidth={2}
                strokeDasharray={ub ? "2 2" : undefined}
              />
              {ticks.map((r, j) => {
                const inWin = r.evidence.includes("in_window");
                return (
                  <g key={j} className="tl-tick" style={{ animationDelay: `${600 + i * 80 + j * 60}ms` }}>
                    <line
                      x1={x(r.resolved_at)}
                      x2={x(r.resolved_at)}
                      y1={y - 3}
                      y2={y + 13}
                      stroke={inWin ? "var(--color-l1)" : "var(--color-l2)"}
                      strokeWidth={2}
                    />
                    <title>
                      {svcSlug(r.service)} · {r.sha.slice(0, 12)} · {iso(r.resolved_at)} · {r.evidence}
                    </title>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground" aria-label="legend">
        <Key swatch={<span className="block h-2 w-5 bg-signal/35 ring-1 ring-signal/60" />}>installable window</Key>
        <Key swatch={<span className="block h-3 w-0.5 bg-signal" />}>exact edge</Key>
        <Key swatch={<span className="block h-3 w-0.5 border-l-2 border-dashed border-signal" />}>upper bound (npm publishes no takedown time)</Key>
        <Key swatch={<span className="block h-3 w-0.5 bg-l1" />}>lockfile commit in window</Key>
        <Key swatch={<span className="block h-3 w-0.5 bg-l2" />}>pins a removed version</Key>
        <Key swatch={<span className="block h-3 w-0.5 border-l border-dashed border-muted-foreground" />}>advisory published</Key>
      </ul>
    </div>
  );
}

function Key({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span className="inline-flex w-5 justify-center" aria-hidden>
        {swatch}
      </span>
      {children}
    </li>
  );
}

const iso = (t: number) => new Date(t * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
