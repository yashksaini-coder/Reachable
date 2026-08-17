import { Box, Edge, Note, Svg } from "./_shared";

// The graph model: seven node labels, nine relationship types, and the properties that carry
// the answers (windows on AFFECTS, commit time on RESOLVED, kind/distance on NAME_SIMILAR_TO).
export default function Schema() {
  const id = "schema";
  const R1 = 100;
  const R2 = 290;
  const W = 130;
  return (
    <Svg id={id} title="Graph schema: Advisory AFFECTS Version with a live window; Lockfile RESOLVED Version at a commit time; Service HAS_LOCKFILE Lockfile and CONTAINS File; File IMPORTS Package; Version VERSION_OF Package; Version DEPENDS_ON Version; Maintainer MAINTAINS Package; Package NAME_SIMILAR_TO Package" h={420}>
      {/* row 1 */}
      <Box cx={95} cy={R1} w={W} kind="node" label="Advisory" />
      <Box cx={345} cy={R1} w={W} kind="node" label="Version" />
      <Box cx={595} cy={R1} w={W} kind="node" label="Lockfile" />
      <Box cx={825} cy={R1} w={W} kind="node" label="Service" />
      {/* row 2 */}
      <Box cx={95} cy={R2} w={W} kind="node" label="Maintainer" />
      <Box cx={345} cy={R2} w={W} kind="node" label="Package" />
      <Box cx={825} cy={R2} w={W} kind="node" label="File" />

      {/* AFFECTS with the window */}
      <Edge id={id} d={`M 160 ${R1} H 278`} tone="signal" label="AFFECTS" lx={219} ly={R1 - 10} />
      <text x={219} y={R1 + 18} textAnchor="middle" className="fill-mut font-mono text-[9.5px]">{"{live_from, live_to,"}</text>
      <text x={219} y={R1 + 30} textAnchor="middle" className="fill-mut font-mono text-[9.5px]">{"live_to_kind}"}</text>

      {/* RESOLVED with at */}
      <Edge id={id} d={`M 530 ${R1} H 412`} tone="signal" label="RESOLVED" lx={471} ly={R1 - 10} />
      <text x={471} y={R1 + 18} textAnchor="middle" className="fill-mut font-mono text-[9.5px]">{"{at}"}</text>

      <Edge id={id} d={`M 760 ${R1} H 662`} label="HAS_LOCKFILE" lx={711} ly={R1 - 10} />

      {/* DEPENDS_ON self loop above Version */}
      <Edge id={id} d={`M 320 ${R1 - 19} V 44 H 370 V ${R1 - 21}`} label="DEPENDS_ON {range}" lx={345} ly={36} />

      {/* Version → Package */}
      <Edge id={id} d={`M 345 ${R1 + 19} V ${R2 - 21}`} label="VERSION_OF" lx={353} ly={(R1 + R2) / 2 + 3} anchor="start" />

      {/* Maintainer → Package */}
      <Edge id={id} d={`M 160 ${R2} H 278`} label="MAINTAINS" lx={219} ly={R2 - 10} />

      {/* Service → File, File → Package */}
      <Edge id={id} d={`M 825 ${R1 + 19} V ${R2 - 21}`} label="CONTAINS" lx={833} ly={(R1 + R2) / 2 + 3} anchor="start" />
      <Edge id={id} d={`M 760 ${R2} H 412`} label="IMPORTS {line}" lx={586} ly={R2 - 10} />

      {/* NAME_SIMILAR_TO self loop below Package */}
      <Edge id={id} d={`M 320 ${R2 + 19} V 356 H 370 V ${R2 + 21}`} label="NAME_SIMILAR_TO {kind, distance}" lx={345} ly={372} />

      <Note x={40} y={404} tone="fill-dim">ids: 52-bit integer ids, key property on every node, eid on every edge · timestamps int epoch seconds UTC · live_to is an upper bound.</Note>
    </Svg>
  );
}
