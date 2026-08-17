import { Badge, Box, Edge, Note, Svg, type Tone } from "./_shared";

// One small graph, six walks. Every name is from the MAL-2025-46974 report; each question is a
// traversal starting from a different node and reading a different edge property. Laid out on a
// 1080-wide canvas so no label shares space with another: row 1 is the exposure chain (Q1/Q2/Q3),
// row 2 the package/maintainer/near-name walks (Q4/Q5), row 3 the fan-out target; Q6 hangs off
// the service as the verdict.
const LEGEND: { n: number; tone: Tone; text: string }[] = [
  { n: 1, tone: "signal", text: "who is exposed" },
  { n: 2, tone: "signal2", text: "which versions" },
  { n: 3, tone: "l1", text: "resolved while live" },
  { n: 4, tone: "mut", text: "maintainer fan-out" },
  { n: 5, tone: "fg", text: "near names" },
  { n: 6, tone: "input", text: "verdict" },
];

export default function SixQuestions() {
  const id = "sixq";
  const W = 1060;
  const R1 = 90; // exposure chain
  const R2 = 270; // package row
  const R3 = 400; // fan-out target
  const X = { adv: 120, ver: 380, lock: 650, svc: 940 }; // row-1 centres
  const B = 176; // row-1 box width
  return (
    <Svg id={id} w={W} h={470} title="Six questions on one graph: advisory MAL-2025-46974 affects debug@4.4.2, resolved by lockfile cakestory-api@458e59e of service LVQT-ss/cakestory-api; debug is maintained by qix who also maintains color-convert; @types/debug is a near name; each question is a numbered walk">
      {/* row 1 — the exposure chain */}
      <Box cx={X.adv} cy={R1} w={B} kind="Advisory" label="MAL-2025-46974" />
      <Box cx={X.ver} cy={R1} w={B} kind="Version" label="debug@4.4.2" dot="fill-l2" />
      <Box cx={X.lock} cy={R1} w={B + 24} kind="Lockfile" label="cakestory-api@458e59e" />
      <Box cx={X.svc} cy={R1} w={B + 24} kind="Service" label="LVQT-ss/cakestory-api" />

      {/* Q2 advisory → versions, with the window carried on the edge */}
      <Edge id={id} d={`M ${X.adv + B / 2 + 4} ${R1} H ${X.ver - B / 2 - 6}`} tone="signal2" label="AFFECTS" lx={(X.adv + X.ver) / 2} ly={R1 - 14} />
      <Note x={(X.adv + X.ver) / 2} y={R1 + 34} anchor="middle" tone="fill-signal-2">live_from · live_to · live_to_kind</Note>
      <Badge x={(X.adv + X.ver) / 2} y={R1 + 56} n={2} tone="signal2" />

      {/* Q1 the walk goes against the stored edges: service → lockfile → version */}
      <Edge id={id} d={`M ${X.lock - (B + 24) / 2 - 4} ${R1} H ${X.ver + B / 2 + 6}`} tone="signal" label="RESOLVED" lx={(X.ver + X.lock) / 2} ly={R1 - 14} />
      <Edge id={id} d={`M ${X.svc - (B + 24) / 2 - 4} ${R1} H ${X.lock + (B + 24) / 2 + 6}`} tone="signal" label="HAS_LOCKFILE" lx={(X.lock + X.svc) / 2} ly={R1 - 14} />
      <Badge x={(X.lock + X.svc) / 2} y={R1 + 22} n={1} tone="signal" />

      {/* Q3 the same RESOLVED edge, read by its `at` against the AFFECTS window — its own row of ink */}
      <Note x={(X.ver + X.lock) / 2} y={R1 + 34} anchor="middle" tone="fill-l1">at ∈ [live_from, live_to]</Note>
      <Badge x={(X.ver + X.lock) / 2} y={R1 + 56} n={3} tone="l1" />

      {/* Q6 verdict on the service */}
      <Badge x={X.svc} y={R1 + 40} n={6} tone="input" />
      <g>
        {[
          ["fill-l2", "reachable · act now", 0],
          ["fill-l1", "imported", 1],
          ["fill-l0", "present only", 2],
          ["fill-unknown", "unscanned", 3],
        ].map(([cls, txt, i]) => (
          <g key={String(txt)}>
            <circle cx={X.svc - 92} cy={R1 + 68 + Number(i) * 18} r={3.5} className={String(cls)} />
            <text x={X.svc - 82} y={R1 + 72 + Number(i) * 18} className="fill-dim font-mono text-[12px]">{txt}</text>
          </g>
        ))}
      </g>

      {/* row 2 — Q4 version → package → maintainer → other packages; Q5 near names */}
      <Box cx={X.adv} cy={R2} w={B} kind="Maintainer" label="qix" />
      <Box cx={X.ver} cy={R2} w={B} kind="Package" label="debug" />
      <Box cx={X.lock} cy={R2} w={B + 24} kind="Package" label="@types/debug" />
      <Edge id={id} d={`M ${X.ver} ${R1 + 21} V ${R2 - 23}`} tone="mut" label="VERSION_OF" lx={X.ver + 10} ly={(R1 + R2) / 2 + 4} anchor="start" />
      <Edge id={id} d={`M ${X.adv + B / 2 + 4} ${R2} H ${X.ver - B / 2 - 6}`} tone="mut" label="MAINTAINS" lx={(X.adv + X.ver) / 2} ly={R2 - 14} />
      <Badge x={(X.adv + X.ver) / 2} y={R2 + 24} n={4} tone="mut" />
      <Edge id={id} d={`M ${X.lock - (B + 24) / 2 - 4} ${R2} H ${X.ver + B / 2 + 6}`} tone="fg" label="NAME_SIMILAR_TO" lx={(X.ver + X.lock) / 2} ly={R2 - 14} />
      <Note x={(X.ver + X.lock) / 2} y={R2 + 34} anchor="middle" tone="fill-dim">kind = scope · distance = 1</Note>
      <Badge x={(X.ver + X.lock) / 2} y={R2 + 56} n={5} tone="fg" />

      {/* row 3 — the fan-out target */}
      <Box cx={X.adv} cy={R3} w={B} kind="Package" label="color-convert" />
      <Edge id={id} d={`M ${X.adv} ${R2 + 21} V ${R3 - 23}`} tone="mut" label="MAINTAINS" lx={X.adv + 10} ly={(R2 + R3) / 2 + 4} anchor="start" />
      <Note x={X.adv + B / 2 + 16} y={R3 + 4}>→ the services resolving color-convert today, per package, in one statement</Note>

      {/* legend */}
      {LEGEND.map((l, i) => (
        <g key={l.n}>
          <Badge x={40 + i * 172} y={452} n={l.n} tone={l.tone} />
          <text x={58 + i * 172} y={456} className="fill-mut text-[13px]">{l.text}</text>
        </g>
      ))}
    </Svg>
  );
}
