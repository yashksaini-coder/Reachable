import { Note, Svg } from "./_shared";

// Q3 — resolved while live: the AFFECTS window on a time axis, the two in-window commits from
// the report, and the later pins of an erased version. Times are 2025-09-08 UTC.
const X0 = 70; // 13:00
const px = (min: number) => X0 + min * (760 / 240); // 13:00 → 17:00 across 760px

const LIVE_FROM = px(12.65); // 13:12:39
const LIVE_TO = px(86.85); // 14:26:51 = advisory published
const COMMITS = [
  { x: px(65.2), t: "14:05:12", who: "cakestory-api@458e59e", ly: 100 },
  { x: px(69.3), t: "14:09:18", who: "n8n-node-gomake@c361ccf", ly: 122 },
];
const PINS = [
  { x: px(124.98), t: "15:04:59", who: "ai-research-automation@80fc6d0" },
  { x: px(235.4), t: "16:55:24", who: "ai-research-automation@5b74cd6" },
];
const TICKS = ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];

export default function Q3Window() {
  const id = "q3";
  const AX = 200;
  return (
    <Svg id={id} title="Q3 window: debug@4.4.2 was installable from 13:12:39 until at most 14:26:51 UTC on 2025-09-08; two lockfile commits at 14:05 and 14:09 fall inside the window; later commits pin the erased version" h={340}>
      {/* axis */}
      <line x1={X0} y1={AX} x2={830} y2={AX} className="stroke-border" strokeWidth={1} />
      {TICKS.map((t, i) => (
        <g key={t}>
          <line x1={X0 + i * 95} y1={AX} x2={X0 + i * 95} y2={AX + 5} className="stroke-input" strokeWidth={1} />
          <text x={X0 + i * 95} y={AX + 18} textAnchor="middle" className="fill-dim font-mono text-[10px]">{t}</text>
        </g>
      ))}

      {/* installable bar: solid start, dashed end (upper bound) */}
      <rect x={LIVE_FROM} y={AX - 34} width={LIVE_TO - LIVE_FROM} height={24} className="fill-card2" />
      <path d={`M ${LIVE_TO} ${AX - 34} H ${LIVE_FROM} V ${AX - 10} H ${LIVE_TO}`} fill="none" className="stroke-signal" strokeWidth={1.4} />
      <line x1={LIVE_TO} y1={AX - 34} x2={LIVE_TO} y2={AX - 10} className="stroke-signal" strokeWidth={1.4} strokeDasharray="4 3" />
      <text x={LIVE_FROM} y={AX - 42} className="fill-signal font-mono text-[10px]">live_from 13:12:39 · exact</text>

      {/* advisory published = live_to */}
      <line x1={LIVE_TO} y1={72} x2={LIVE_TO} y2={AX + 34} className="stroke-input" strokeWidth={1} strokeDasharray="4 3" />
      <text x={LIVE_TO + 8} y={AX - 62} className="fill-mut font-mono text-[10px]">advisory published 14:26:51</text>
      <text x={LIVE_TO + 8} y={AX - 48} className="fill-dim font-mono text-[10px]">= live_to · upper bound (npm publishes no takedown time)</text>

      {/* in-window commits */}
      {COMMITS.map((c) => (
        <g key={c.t}>
          <line x1={c.x} y1={c.ly + 6} x2={c.x} y2={AX - 22} className="stroke-l1" strokeWidth={1} />
          <circle cx={c.x} cy={AX - 22} r={4} className="fill-l1" />
          <text x={c.x - 6} y={c.ly} textAnchor="end" className="fill-l1 font-mono text-[10px]">{c.who} · {c.t}</text>
        </g>
      ))}
      <text x={X0} y={80} className="fill-l1 text-[10.5px]">in_window: pin committed while installable</text>

      {/* pins of the erased version, after the window */}
      {PINS.map((p) => (
        <g key={p.t}>
          <circle cx={p.x} cy={AX} r={4} className="fill-l2" />
          <text x={p.x + 4} y={AX + 40} textAnchor="end" className="fill-l2 font-mono text-[10px]">{p.who} · {p.t}</text>
        </g>
      ))}
      <text x={PINS[0].x} y={AX + 56} textAnchor="middle" className="fill-dim text-[10.5px]">pinned_removed: the lockfile pins a version npm has erased — only possible while it was live</text>
      <text x={830} y={AX + 72} textAnchor="end" className="fill-dim font-mono text-[10px]">+2 later pins: 09-09 15:54 · 09-13 04:37</text>

      {/* the predicate */}
      <text x={X0} y={300} className="fill-signal-2 font-mono text-[11px]">WHERE r.at &gt;= af.live_from AND r.at &lt;= af.live_to</text>
      <Note x={X0} y={320}>one engine-side predicate: RESOLVED.at against the AFFECTS window — the window lives on the edge, so a version hit by two advisories has two windows.</Note>
    </Svg>
  );
}
