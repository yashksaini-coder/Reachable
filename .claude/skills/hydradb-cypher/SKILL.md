---
name: hydradb-cypher
description: Use when writing any Cypher for this project's HydraDB node — schema, ingestion, or queries. Records the OpenCypher subset actually verified against a running node by `make probe`, including the constraints that shape the schema.
---

# HydraDB OpenCypher — verified behaviour

Every statement here was **run against a live node** (HydraDB `0.1.0`,
`ghcr.io/hydra-db/hydradb:latest`, neo4j driver 6.2.0; three probe rounds on
2026-08-16, the last on the real 69k-version graph; re-audited 2026-08-16 evening).
Do not infer anything from Neo4j docs — different engine. When unsure, add a
case to `scripts/probe.py`, run `make probe`, then tick it in `AGENTS.md` §8.

## Identity and ids

- **Node and relationship ids are non-negative integers.** Full signed-64 range
  accepted, `2^63` refused. We use **52-bit** ids (`ids.gid`) so JSON never loses
  precision in the browser. Every human key (purl, login, path) is hashed to an
  int and stored as property `key`.
- A node's `id` is the vertex id, **not a property**: `'id' in node_props` is
  `False`. `n.id` in `MATCH {id: …}` and `RETURN n.id` both work.
- `<relationship>.id` is unusable in `WHERE`/`RETURN`/`ORDER BY` (parsed as a
  node-id expression → `unbound variable r`). Mirror it as `r.eid`.
- Relationships need their own id in `MERGE`: *"UNWIND relationship MERGE
  requires id: row.<field>"*. `ids.eid(src, type, dst)` is deterministic.

## Writes — the only forms that work

```cypher
-- nodes: MERGE matches id ONLY; label and every property via SET, all read from the row
UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Package, n.key = row.key, n.name = row.name

-- edges: endpoints carry EXACTLY ONE label each; edge id in the pattern; props via SET
UNWIND $rows AS row
  MATCH (a:Lockfile {id: row.src}), (b:Version {id: row.dst})
  MERGE (a)-[r:RESOLVED {id: row.rid}]->(b) SET r.eid = row.rid, r.at = row.at

-- edge delete: anonymous endpoints, one rel type (5 ms; both ends id-anchored)
UNWIND $rows AS row MATCH (a {id: row.src})-[r:RESOLVED]->(b {id: row.dst}) DELETE r
```

Refused, with the engine's words:

| Statement | Reason |
|---|---|
| `MERGE (n:Label {id: row.id})` | `UNWIND vertex upsert MERGE pattern matches only id; apply labels with SET` |
| `MERGE (n {id: 1}) SET n.x = 1` (no UNWIND) | `MERGE with following clauses is not executable` — **all writes go through UNWIND** |
| `SET n.dead = true` | values must read from the row map: `SET n.dead = row.dead` |
| 1025 rows | `client_query_batch_items … exceeds limit 1024` — **batch at 1000** |
| `null` anywhere in `$rows` | `only boolean, signed integer, finite float, and string parameters are supported` — omit `None`-valued keys per row (`load._by_shape`) |
| `MATCH (a {id})-[r:T {id: row.rid}]->(b:L {id})` DELETE r | `relationship property DELETE requires anonymous endpoints and one edge type` |
| `CREATE INDEX` (3.x or 4.x form) | `expected query, got CREATE INDEX` — **no DDL**; `graph-indexer` indexes on write |
| explicit transactions | `explicit transactions are not supported; use auto-commit RUN queries` |
| `UNWIND … MATCH … REMOVE` | UNWIND-MATCH must end in `RETURN` or `DELETE` |

Costs: 1000-row upsert 9–17 ms warm. **Node deletion by id is a full scan**
(≈1.3 s/row at 25k nodes, `DETACH DELETE` the same) — design so it is never needed;
fixture wipes delete edges only. **Whole-type edge counts time out past ~100k
edges** (`cypher_relationship_edge_records exceeded query timeout`) — never
`MATCH ()-[r:RESOLVED]->() RETURN count(*)`; log big counts at write time.
Comparison operands must be the same type family: a string timestamp in an int
column errors the whole query — coerce at ingest (`load._check`).

## Reads

**Patterns.** Every labelled or property-bearing node needs a name: `(:Lockfile)`
refused (`node labels and non-id properties require a named node`) — write
`(l:Lockfile)`. `WHERE … STARTS WITH $p` fine. `WHERE x IN [...]` refused.

**WHERE.** Property-vs-property works — node-vs-node, rel-vs-node, rel-vs-rel,
all six operators, `AND`/`OR`/`NOT`; e.g. `r.at >= af.live_from AND r.at <= af.live_to`
across two relationships. Property-vs-literal (`n.n >= 0`, `v.removed = true`) and
property-vs-parameter (`sim.distance <= $maxd`) work. Zero arithmetic:
`n.ts >= $from + 100` refused.
Missing property → `null` → row silently dropped, no error.

**RETURN** supports `<binding>.<property>`, `count(*)`, `sum`, `avg`,
`collect(<scalar prop>)` — **nothing else**: no literals, arithmetic, `CASE`,
`coalesce`, `toString`, `id(n)`, `labels(n)`. Anything the UI shows is a stored
property or is attached in Python.

**Aggregates.** `count(*)` with grouping keys works (`RETURN sv.key, count(*)` is
the `count(DISTINCT)` substitute). Refused: `count(x)`, `min`, `max`,
`count(DISTINCT …)`, `collect(DISTINCT …)`, `collect(node)`. `OPTIONAL MATCH`
only with `count(*)`. **`ORDER BY … LIMIT 1` is the min/max substitute** (also
across var-length). `RETURN … ORDER BY` with an aggregate cannot reference row
properties (`aggregate ORDER BY cannot reference row properties`) — sort in Python.
Multi-key `ORDER BY`, `SKIP`, `LIMIT` fine. `WITH` is pass-through only.
`UNION`/`UNION ALL` work, but a trailing `ORDER BY`/`LIMIT` applies to the **last
arm only**, silently; N-arm UNION costs per arm and buys nothing over a loop.

**Variable-length** `-[:T*1..8]->`: bounded only (max hops **16**), rel-type
filter fine. The **source must be an inline integer literal**
(`{id: $p}`, a node bound earlier → `variable-length MATCH requires a fixed source id`);
format via `_int()` — the assert is the injection defence. Incoming var-length
needs the far node in a second pattern segment, **and on the real graph it explodes
from any popular version** (30 s timeout even at `*1..1`). **Avoid it: `RESOLVED`
is the flattened install tree — membership is one hop.** `MATCH p = …` and
`length(p)` refused; hop counts come from `algo.*` paths.

## Path procedures — `algo.SSpaths` / `SPpaths` / `MSpaths`

A **complete standalone statement**: `CALL algo.X({…}) YIELD path RETURN path`.
Nothing may follow (`WHERE`, `WITH`, `MATCH`, `LIMIT` refused); `RETURN` may name
only `path`, `pathWeight`, `pathCost`. Filter in Python.

Config keys (unknown key = parse error): `sourceNode targetNode relTypes
relDirection maxLen weightProp costProp maxCost pathCount resultLimit sourceLabel
sourceProperty sourceValues targetLabel targetProperty targetValues pairwise
fairRelationshipVariants`. `relDirection`: `'outgoing'` (default) / `'incoming'` /
`'both'`. `maxLen` default and cap 16.

- **`pathCount` defaults to 1** — omit it and a 40-fanout node returns one path
  and looks correct. Always pass it.
- **`resultLimit` truncates silently** — no flag, no notification. Request `N+1`,
  treat `len(rows) > N` as truncated, render a banner.
- `sourceLabel/sourceProperty/sourceValues/relTypes` (and the target trio) must be
  **inline literals**; parameters (`composite parameter $vals is only supported as
  an UNWIND input`) and integers (`sourceValues must be a list of strings`) refused.
  Every scalar (`maxLen`, `pathCount`, `resultLimit`, `relDirection`, `maxCost`,
  `sourceNode`, `targetNode`) may be a bound parameter.
- Unknown source value / label / relType → **0 rows, no error**; rel types are
  case-sensitive.
- **Path shape:** a flat list `[node_props, 'RELTYPE', node_props, …]` — no
  labels, no ids; the `key` prefix (`pkg:` / `lock:` / `svc:`) is the label.
  Hops = `(len(path) - 1) // 2`.

**Prefer `SPpaths` / `SSpaths` with integer-id parameters** — zero literal
surface. Verified: `SPpaths({sourceNode: $src, targetNode: $dst, relTypes: [...],
relDirection: 'incoming', maxLen: 9, pathCount: 3})` yields the proving chain
`bad ← DEPENDS_ON ← dep ← RESOLVED ← lockfile` in 600 ms cold / 1 ms warm.

**`MSpaths` only targeted and small.** Untargeted from a bad version returns 0
services (partial `DEPENDS_ON` paths saturate `resultLimit`); `pathCount: 1000`
is refused by admission control (`native_path_frontier_paths … 250001 exceeds
limit 250000`). Always pass `targetLabel/targetProperty/targetValues`, keep
`pathCount` small, and validate every literal with `ids.safe_name` / `safe_purl`
+ `cypher_str_list` — **reject, never escape**.

```cypher
CALL algo.MSpaths({sourceLabel: 'Version', sourceProperty: 'key', sourceValues: ['pkg:npm/x@1.0.0'],
                   targetLabel: 'Service', targetProperty: 'key', targetValues: ['svc:api'],
                   relTypes: ['DEPENDS_ON', 'RESOLVED', 'HAS_LOCKFILE'], relDirection: 'incoming',
                   maxLen: $maxlen, pathCount: $pathcount, resultLimit: $limit}) YIELD path RETURN path
```

## Latency is bimodal — label every number

Object-store-native engine: first touch pages data in. Same targeted MSpaths
**5.4 s cold / 2 ms warm**; one-hop RESOLVED membership over 110 lockfiles 17 ms.
Every quoted figure carries `cold`/`warm` or is `TBD`; `incident.py --runs N`
records both. Under ingest write load `algo.*` may hit the 30 s query timeout
(`native_path_* exceeded query timeout`) — contention, retry.

## Connection

```python
GraphDatabase.driver("bolt://127.0.0.1:7687", auth=("neo4j", TOKEN))  # basic auth, token as password
driver.session(database="default")                                    # database == GRAPH_ID
```

Auto-commit `session.run` only. `consistency: "strong"` is **not reachable over
Bolt from the Python driver** (needs transaction metadata; explicit tx refused);
the HTTP form is `POST /v1/graphs/default/query` with `{"consistency":"strong",…}`
— documented, **not yet probed**.

## Still unverified

HTTP `consistency: "strong"` round trip · weighted paths (`weightProp`/`costProp`,
`pathWeight`/`pathCost`) · `IS NULL`, `CONTAINS`, `ENDS WITH` (documented
unsupported, not probed).
