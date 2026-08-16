import type { VersionRow, WhileLiveRow } from "@/lib/incident";
import { svcSlug } from "@/lib/format";
import { cn } from "@/lib/utils";

// Q3 — the installable-window timeline (1180×190 viewBox). A real time axis; the installable
// span as a --sigfill bar stroked --signal (one bar per bounded version at the same y, so gaps
// between versions stay visible) with a 3px-dashed --signal edge where live_to is an upper bound;
// amber up-triangles for lockfile writes inside the window, red triangles below the axis for
// commits that pin a removed version, a grey rule for advisory-published. Markers closer than
// ~45 user units cluster into one `name, name ×N` label so nothing overlaps or lies about count.
// Server-rendered SVG, no client JS.

const X0 = 60;
const X1 = 1120;
const AXIS = 130;
const CLUSTER = 45;
const STEPS = [60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800, 1209600, 2592000];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function Timeline({ rows, versions, advisoryPublished }: { rows: WhileLiveRow[]; versions: VersionRow[]; advisoryPublished: number }) {
  const bounded = versions.filter((v) => v.live_to < 4_000_000_000);
  if (bounded.length === 0) return null;
  const t0 = Math.min(...bounded.map((v) => v.live_from), ...rows.map((r) => r.resolved_at));
  const t1 = Math.max(...bounded.map((v) => v.live_to), ...rows.map((r) => r.resolved_at), advisoryPublished);
  const span = Math.max(t1 - t0, 60);
  const lo = t0 - span * 0.12;
  const hi = t1 + span * 0.18;
  const x = (t: number) => X0 + ((t - lo) / (hi - lo)) * (X1 - X0);

  const step = STEPS.find((s) => (hi - lo) / s < 9) ?? Math.ceil((hi - lo) / 9 / 86400) * 86400;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  const dateMode = step >= 86400;
  const tickLabel = (t: number) => {
    const d = new Date(t * 1000);
    return dateMode ? `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}` : d.toISOString().slice(11, 16);
  };

  const barStart = Math.min(...bounded.map((v) => v.live_from));
  const barEnd = Math.max(...bounded.map((v) => v.live_to));
  const upper = bounded.some((v) => v.live_to === barEnd && v.live_to_kind === "upper_bound");
  const inWin = cluster(rows.filter((r) => r.evidence.includes("in_window")).map((r) => [x(r.resolved_at), r] as const));
  const removed = cluster(rows.filter((r) => !r.evidence.includes("in_window")).map((r) => [x(r.resolved_at), r] as const));
  const adX = x(advisoryPublished);
  // A 90-minute window on a multi-day axis is a sliver: put its label to the LEFT of the bar so it
  // never collides with the `upper bound` label at the bar's right edge or the advisory rule.
  const narrow = x(barEnd) - x(barStart) < 170;
  const adFlip = adX > X1 - 140;

  return (
    <div className="overflow-x-auto overscroll-x-contain px-[10px] pt-3">
      <svg
        viewBox="0 0 1180 190"
        className="h-auto w-full min-w-[1000px]"
        role="img"
        aria-label={`installable window: ${bounded.length} version${bounded.length === 1 ? "" : "s"}, ${rows.length} lockfile commits`}
      >
        <line x1={X0} y1={AXIS} x2={X1} y2={AXIS} className="stroke-input" strokeWidth={1} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={AXIS} x2={x(t)} y2={AXIS + 6} className="stroke-input" strokeWidth={1} />
            <text x={x(t)} y={AXIS + 22} textAnchor="middle" className="fill-dim font-mono text-[10.5px]">
              {tickLabel(t)}
            </text>
          </g>
        ))}
        {bounded.map((v) => (
          <rect key={v.version} x={x(v.live_from)} y={76} width={Math.max(x(v.live_to) - x(v.live_from), 2)} height={24} rx={4} className="fill-sigfill stroke-signal" strokeWidth={1}>
            <title>{`${v.version.replace(/^pkg:npm\//, "")} · ${v.live_from_iso} → ${v.live_to_iso} (${v.live_to_kind.replace("_", " ")})`}</title>
          </rect>
        ))}
        {upper && <line x1={x(barEnd)} y1={70} x2={x(barEnd)} y2={106} className="stroke-signal" strokeWidth={1.4} strokeDasharray="3 3" />}
        <text x={narrow ? x(barStart) - 8 : x(barStart) + 8} y={92} textAnchor={narrow ? "end" : "start"} className="fill-signal-2 font-mono text-[11px]">
          installable · {bounded.length} version{bounded.length === 1 ? "" : "s"}
        </text>
        {upper && (
          <text x={x(barEnd) + 8} y={92} className="fill-signal-2 font-mono text-[10.5px]">
            upper bound
          </text>
        )}
        <line x1={adX} y1={48} x2={adX} y2={AXIS} className="stroke-mut" strokeWidth={1} />
        <text x={adX + (adFlip ? -8 : 8)} y={54} textAnchor={adFlip ? "end" : "start"} className="fill-mut font-mono text-[10.5px]">
          advisory published
        </text>
        {inWin.map((c, i) => {
          const flip = c.x > X1 - 140; // labels near the right edge anchor end so they stay in the viewBox
          return (
            <g key={`w${i}`}>
              <title>{c.rows.map(tip).join("\n")}</title>
              <path d={`M${c.x} ${AXIS - 16} l6 11 h-12 z`} className="fill-l1" />
              <text x={c.x + (flip ? -10 : 0)} y={AXIS - 22} textAnchor={flip ? "end" : "middle"} className="fill-l1 font-mono text-[10.5px]">
                {c.label}
              </text>
            </g>
          );
        })}
        {removed.map((c, i) => {
          const flip = c.x > X1 - 140;
          return (
            <g key={`r${i}`}>
              <title>{c.rows.map(tip).join("\n")}</title>
              <path d={`M${c.x} ${AXIS + 34} l6 -11 h-12 z`} className="fill-l2" />
              <text x={c.x + (flip ? -10 : 10)} y={AXIS + 44} textAnchor={flip ? "end" : "start"} className="fill-l2 font-mono text-[10.5px]">
                {c.label}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="mt-1.5 flex flex-wrap gap-[18px] px-2 pb-3.5 font-mono text-[10.5px] leading-none text-dim" aria-label="legend">
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-3.5 border border-signal bg-sigfill" aria-hidden />
          installable window
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-0 border-l-[1.5px] border-dashed border-signal" aria-hidden />
          upper bound · npm publishes no takedown time
        </li>
        <li className="inline-flex items-center gap-1.5">
          <Tri className="fill-l1" />
          lockfile resolved in window
        </li>
        <li className="inline-flex items-center gap-1.5">
          <Tri className="fill-l2" />
          pins a removed version
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-[9px] w-px bg-mut" aria-hidden />
          advisory published
        </li>
      </ul>
    </div>
  );
}

// Left-to-right sweep: a marker within CLUSTER units of the cluster's first marker joins it.
function cluster(marks: readonly (readonly [number, WhileLiveRow])[]) {
  const out: { x: number; rows: WhileLiveRow[]; label: string }[] = [];
  for (const [mx, r] of [...marks].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && mx - last.x < CLUSTER) last.rows.push(r);
    else out.push({ x: mx, rows: [r], label: "" });
  }
  for (const c of out) {
    const names = [...new Set(c.rows.map((r) => svcSlug(r.service).split("/").pop()!))];
    c.label = (names.length > 2 ? names.slice(0, 2).join(", ") + ", …" : names.join(", ")) + (c.rows.length > 1 ? ` ×${c.rows.length}` : "");
  }
  return out;
}

const tip = (r: WhileLiveRow) => `${svcSlug(r.service)} · ${r.sha.slice(0, 12)} · ${r.resolved_at_iso} · ${r.evidence.replace(/_/g, " ").replace("+", " + ")}`;

function Tri({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 12 11" className={cn("h-[9px] w-[10px]", className)} aria-hidden>
      <path d="M6 0l6 11H0z" />
    </svg>
  );
}
