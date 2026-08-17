import { Box, Edge, Note, Svg } from "./_shared";

// Q1 — who resolves the bad version: one real explanation path from the report, walked by
// algo.SPpaths from the bad version outward (relDirection: incoming) to the service.
export default function Q1Walk() {
  const id = "q1";
  const y = 140;
  return (
    <Svg id={id} title="Q1 walk: debug@4.4.2 is depended on by agent-base@6.0.2, which the lockfile cakestory-api@458e59e resolved, which the service LVQT-ss/cakestory-api has; SPpaths walks it from the bad version outward" h={300}>
      {/* traversal direction, above the chain */}
      <Edge id={id} d="M 40 62 H 860" tone="mut" dashed label="algo.SPpaths · sourceNode = bad version · relDirection: incoming · maxLen 9 · pathCount 3" lx={450} ly={52} labelTone="fill-mut" />

      <Box cx={100} cy={y} w={140} kind="Version" label="debug@4.4.2" stroke="stroke-signal" dot="fill-l2" />
      <Box cx={330} cy={y} w={140} kind="Version" label="agent-base@6.0.2" stroke="stroke-signal" />
      <Box cx={560} cy={y} w={140} kind="Lockfile" label="cakestory-api@458e59e" stroke="stroke-signal" />
      <Box cx={795} cy={y} w={160} kind="Service" label="LVQT-ss/cakestory-api" stroke="stroke-signal" />

      {/* edges point in their stored direction; the walk goes against them */}
      <Edge id={id} d={`M 258 ${y} H 172`} tone="signal" label="DEPENDS_ON" lx={215} ly={y - 8} />
      <Edge id={id} d={`M 488 ${y} H 402`} tone="signal" label="RESOLVED" lx={445} ly={y - 8} />
      <Edge id={id} d={`M 713 ${y} H 632`} tone="signal" label="HAS_LOCKFILE" lx={672} ly={y - 8} />

      {/* the 0-hop path: the same lockfile pins debug@4.4.2 directly */}
      <Edge id={id} d={`M 560 ${y + 20} V 214 H 100 V ${y + 21}`} tone="input" label="RESOLVED · 0 hops (direct pin of debug@4.4.2)" lx={330} ly={228} />

      <Note x={40} y={264}>SPpaths returns the 3 shortest paths per lockfile — an explanation, not the full set.</Note>
      <Note x={40} y={282}>MSpaths: N versions × M services in one call over RESOLVED + HAS_LOCKFILE (maxLen 2) — membership for every watched service at once.</Note>
    </Svg>
  );
}
