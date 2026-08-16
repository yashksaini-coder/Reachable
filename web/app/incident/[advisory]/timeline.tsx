import type { VersionRow, WhileLiveRow } from "@/lib/incident";
import { short, svcSlug } from "@/lib/incident";

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
  const H = 40 + bounded.length * rowH + 20;
  const hours = Math.round(((hi - lo) / 3600) * 10) / 10;

  return (
    <div className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="mb-1 flex justify-between font-mono text-[10px] text-zinc-500">
        <span>{iso(lo)}</span>
        <span>{hours} h shown · bar = installable window · tick = lockfile commit</span>
        <span>{iso(hi)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="temporal window timeline">
        {/* advisory published */}
        <line x1={x(advisoryPublished)} x2={x(advisoryPublished)} y1={8} y2={H - 14} stroke="#a1a1aa" strokeDasharray="3 3" />
        <text x={x(advisoryPublished) + 4} y={16} fill="#a1a1aa" fontSize="10" fontFamily="ui-monospace, monospace">
          advisory published
        </text>
        {bounded.map((v, i) => {
          const y = 34 + i * rowH;
          const ub = v.live_to_kind !== "exact";
          const ticks = rows.filter((r) => r.version === v.version);
          return (
            <g key={v.version}>
              <text x={0} y={y - 4} fill="#d4d4d8" fontSize="10" fontFamily="ui-monospace, monospace">
                {short(v.version)}
              </text>
              <rect x={x(v.live_from)} y={y} width={Math.max(x(v.live_to) - x(v.live_from), 2)} height={10} fill="#f97316" fillOpacity={0.35} />
              <line x1={x(v.live_from)} x2={x(v.live_from)} y1={y - 2} y2={y + 12} stroke="#f97316" strokeWidth={2} />
              <line
                x1={x(v.live_to)}
                x2={x(v.live_to)}
                y1={y - 2}
                y2={y + 12}
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray={ub ? "2 2" : undefined}
              />
              {ticks.map((r, j) => {
                const inWin = r.evidence.includes("in_window");
                return (
                  <g key={j}>
                    <line
                      x1={x(r.resolved_at)}
                      x2={x(r.resolved_at)}
                      y1={y - 3}
                      y2={y + 13}
                      stroke={inWin ? "#fbbf24" : "#f87171"}
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
        <text x={0} y={H - 2} fill="#71717a" fontSize="9" fontFamily="ui-monospace, monospace">
          solid edge = exact · dashed edge = upper bound (npm publishes no takedown time) · amber tick = in window · red tick = pins a removed version
        </text>
      </svg>
    </div>
  );
}

const iso = (t: number) => new Date(t * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
