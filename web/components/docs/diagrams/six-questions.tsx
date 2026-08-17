import { Badge, Box, Edge, Note, Svg, type Tone } from "./_shared";

// One small graph, six walks. Every name is from the MAL-2025-46974 report; each question is a
// traversal starting from a different node and reading a different edge property.
const LEGEND: { n: number; tone: Tone; text: string }[] = [
  { n: 1, tone: "signal", text: "who is exposed" },
  { n: 2, tone: "signal2", text: "which versions" },
  { n: 3, tone: "l1", text: "resolved while live" },
  { n: 4, tone: "mut", text: "maintainer fan-out" },
  { n: 5, tone: "fg", text: "near names" },
];

export default function SixQuestions() {
  const id = "sixq";
  const R1 = 100;
  const R2 = 230;
  const R3 = 330;
  return (
    <Svg id={id} title="Six questions on one graph: advisory MAL-2025-46974 affects debug@4.4.2, resolved by lockfile cakestory-api@458e59e of service LVQT-ss/cakestory-api; debug is maintained by qix who also maintains color-convert; @types/debug is a near name; each question is a numbered walk" h={400}>
      {/* row 1 */}
      <Box cx={100} cy={R1} w={150} kind="Advisory" label="MAL-2025-46974" />
      <Box cx={330} cy={R1} w={150} kind="Version" label="debug@4.4.2" dot="fill-l2" />
      <Box cx={555} cy={R1} w={150} kind="Lockfile" label="cakestory-api@458e59e" />
      <Box cx={805} cy={R1} w={160} kind="Service" label="LVQT-ss/cakestory-api" />
      {/* row 2 */}
      <Box cx={100} cy={R2} w={150} kind="Maintainer" label="qix" />
      <Box cx={330} cy={R2} w={150} kind="Package" label="debug" />
      <Box cx={560} cy={R2} w={160} kind="Package" label="@types/debug" />
      {/* row 3 */}
      <Box cx={100} cy={R3} w={150} kind="Package" label="color-convert" />

      {/* Q2 advisory → versions */}
      <Edge id={id} d={`M 175 ${R1} H 253`} tone="signal2" label="AFFECTS" lx={214} ly={R1 - 10} />
      <Badge x={214} y={R1 + 22} n={2} tone="signal2" />

      {/* Q1 service → lockfile → version (edges stored the other way; the walk goes against them) */}
      <Edge id={id} d={`M 480 ${R1} H 407`} tone="signal" label="RESOLVED" lx={443} ly={R1 - 10} />
      <Edge id={id} d={`M 720 ${R1} H 637`} tone="signal" label="HAS_LOCKFILE" lx={678} ly={R1 - 10} />
      <Badge x={678} y={R1 + 22} n={1} tone="signal" />

      {/* Q3 the same RESOLVED edge, read with its at against the AFFECTS window */}
      <Edge id={id} d={`M 480 ${R1 + 12} H 407`} tone="l1" dashed label="at ∈ [live_from, live_to]" lx={443} ly={R1 + 32} />
      <Badge x={443} y={R1 + 50} n={3} tone="l1" />

      {/* Q4 version → package → maintainer → other packages */}
      <Edge id={id} d={`M 330 ${R1 + 19} V ${R2 - 21}`} tone="mut" label="VERSION_OF" lx={338} ly={(R1 + R2) / 2 + 3} anchor="start" />
      <Edge id={id} d={`M 175 ${R2} H 253`} tone="mut" label="MAINTAINS" lx={214} ly={R2 - 10} />
      <Edge id={id} d={`M 100 ${R2 + 19} V ${R3 - 21}`} tone="mut" label="MAINTAINS" lx={108} ly={(R2 + R3) / 2 + 3} anchor="start" />
      <Badge x={214} y={R2 + 22} n={4} tone="mut" />
      <Note x={190} y={R3 + 4}>→ services resolving color-convert today</Note>

      {/* Q5 near names, materialised at ingest */}
      <Edge id={id} d={`M 480 ${R2} H 407`} tone="fg" label="NAME_SIMILAR_TO" lx={443} ly={R2 - 10} />
      <Badge x={443} y={R2 + 22} n={5} tone="fg" />
      <Note x={443} y={R2 + 44} anchor="middle" tone="fill-dim">kind=scope · distance=1</Note>

      {/* Q6 verdict on the service */}
      <Badge x={805} y={R1 + 40} n={6} tone="input" />
      <g>
        <circle cx={718} cy={R1 + 62} r={3.5} className="fill-l2" />
        <text x={726} y={R1 + 66} className="fill-dim font-mono text-[10px]">reachable</text>
        <circle cx={822} cy={R1 + 62} r={3.5} className="fill-l1" />
        <text x={830} y={R1 + 66} className="fill-dim font-mono text-[10px]">imported</text>
        <circle cx={718} cy={R1 + 80} r={3.5} className="fill-l0" />
        <text x={726} y={R1 + 84} className="fill-dim font-mono text-[10px]">present only</text>
        <circle cx={822} cy={R1 + 80} r={3.5} className="fill-unknown" />
        <text x={830} y={R1 + 84} className="fill-dim font-mono text-[10px]">unscanned</text>
      </g>

      {/* legend */}
      {LEGEND.map((l, i) => (
        <g key={l.n}>
          <Badge x={40 + i * 150} y={382} n={l.n} tone={l.tone} />
          <text x={56 + i * 150} y={386} className="fill-mut text-[10.5px]">{l.text}</text>
        </g>
      ))}
      <Badge x={790} y={382} n={6} tone="input" />
      <text x={806} y={386} className="fill-mut text-[10.5px]">verdict</text>
    </Svg>
  );
}
