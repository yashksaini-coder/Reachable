---
name: hydradb-cypher
description: Use when writing any Cypher for this project's HydraDB node — schema, ingestion, or queries. Records the OpenCypher subset actually verified against a running node by `make probe`, including the constraints that shape the schema.
---

# HydraDB OpenCypher — verified behaviour

Every statement here was **run against a live node** via `make probe`
(HydraDB `0.1.0`, image `ghcr.io/hydra-db/hydradb:latest`, neo4j driver 6.2.0).
Do not infer anything from Neo4j docs — different engine. When unsure, add a
case to `scripts/probe.py` and run it.

Re-run `make probe` after any HydraDB upgrade; these are engine facts, not
project conventions.

## The four rules that shape the schema

1. **Node and relationship ids are non-negative integers.** A string id is
   rejected: *"UNWIND row 0 field id must be a non-negative integer"*. Every
   purl must be hashed to a stable int; keep the human key as a property.
2. **Relationships need their own id too.** `UNWIND ... MERGE (a)-[:R]->(b)`
   is rejected with *"UNWIND relationship MERGE requires id: row.<field>"*.
   Allocate a deterministic edge id (hash of src+type+dst).
3. **All property writes go through `UNWIND`.** Plain `MERGE (n {id: 1}) SET n.x = 1`
   is rejected — *"MERGE with following clauses is not executable"*. There is no
   single-node convenience write.
4. **Batches are capped at 1024 rows.** 1025 is refused by admission control
   (`client_query_batch_items ... exceeds limit 1024`). Batch at 1000.

## Writes

```cypher
-- upsert nodes (the only property-write form)
UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Package, n.name = row.name

-- upsert relationships, with properties
UNWIND $rows AS row
  MATCH (s:Package {id: row.src}), (d:Package {id: row.dst})
  MERGE (s)-[r:DEPENDS_ON {id: row.rid}]->(d)
  SET r.range = row.range
```

Properties must not be folded into the `MERGE` pattern — the pattern is the
identity being matched on. Only `id` belongs there.

Measured throughput, warm, local Docker node, single session:
**1000 rows in 9–17 ms (~60k–113k rows/s)**; 1024 rows in 12 ms. Cold first
write is the slow end of that range.

## Reads

Supported and verified:

- `MATCH (a:Pkg {id: 201})-[:DEPENDS_ON*1..8]->(v) RETURN count(*)` — bounded
  variable-length with a rel-type filter. Max hops is **16** by engine config.
- `OPTIONAL MATCH` **with `count(*)`** and with plain property projections.
- `collect(b.name)`.
- `WHERE ... STARTS WITH $prefix` (parameter is fine here).

Rejected — plan around these:

| Construct | Engine's reason |
|---|---|
| `count(b)`, `max()`, `min()` | `RETURN currently supports <binding>.<property> or count(*)` |
| `WHERE x IN [...]` | `WHERE currently supports boolean combinations of property comparisons` |
| `*1..` unbounded | `unbounded variable-length MATCH requires an explicit max hop` |
| `CREATE INDEX` (either syntax) | `expected query, got CREATE INDEX` — no DDL; `graph-indexer` builds indexes |
| explicit transactions | `explicit transactions are not supported; use auto-commit RUN queries` |

`count(DISTINCT ...)`, `IS NULL`, `CONTAINS`, `ENDS WITH` are documented as
unsupported and were not separately probed.

## Path procedures

`algo.SSpaths` (one source), `algo.SPpaths` (source→target), `algo.MSpaths`
(many sources). Config keys, from `src/query/path_procedure.rs`:

```
sourceNode targetNode relTypes relDirection maxLen weightProp costProp maxCost
pathCount resultLimit sourceLabel sourceProperty sourceValues targetLabel
targetProperty targetValues pairwise fairRelationshipVariants
```

An unknown key is a parse error. `maxLen` defaults to and is capped at **16**.

**`relDirection` accepts `'incoming'`, `'outgoing'`, `'both'`; default is
`'outgoing'`.** `'incoming'` is verified working — this is what makes the
reverse-closure blast-radius query (Q1) possible in one call.

```cypher
-- every service transitively exposed to a compromised package, one call
CALL algo.MSpaths({sourceLabel: 'Pkg', sourceProperty: 'name',
                   sourceValues: ['p108'], relTypes: ['DEPENDS_ON'],
                   relDirection: 'incoming', maxLen: 8, pathCount: 20,
                   resultLimit: 100})
  YIELD path RETURN path
```

`YIELD` columns are `path`, `pathWeight`, `pathCost`; `RETURN` may name only
yielded columns.

### ⚠️ sourceValues is an injection surface

`sourceValues` **must be a list of string literals**. Two verified constraints
combine badly:

- a parameter is refused: *"composite parameter $vals is only supported as an
  UNWIND input"*
- integers are refused: *"sourceValues must be a list of strings"*

So the values have to be **inlined into the query text**, and they come from
npm registry data. Validate with a strict allowlist before building the string,
and **reject** rather than escape:

```python
NPM_NAME = re.compile(r"^(@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$")
```

Never interpolate an unvalidated value into a `CALL algo.*` config map.

## Connection

```python
GraphDatabase.driver("bolt://127.0.0.1:7687", auth=("neo4j", TOKEN))
driver.session(database="default")   # database == GRAPH_ID
```

Auth is **basic auth with the graph token as the password**, not a bearer
scheme. `database` is the `GRAPH_ID`, here `default`.

## Read consistency

`strong` is **not reachable from the Python driver over Bolt.** It is set in
`RUN` metadata or transaction metadata, but the driver exposes metadata only on
explicit transactions, which HydraDB refuses. Use the HTTP API for the one
query that needs it:

```bash
curl -sS http://127.0.0.1:8443/v1/graphs/default/query \
  -H "Authorization: Bearer $TOKEN" -H 'X-Graph-Namespace: default' \
  -H 'Content-Type: application/json' \
  --data '{"cell_id":"cell-0","consistency":"strong","query":"..."}'
```

The HTTP `consistency` field is documented but **not yet probed** — verify
before relying on it.

## Unverified

- HTTP API `consistency: "strong"` round trip
- `sum` / `avg` aggregates
- `UNION` arms
- `pathWeight` / `pathCost` with `weightProp`
- behaviour once `graph-indexer` is running (we run `graph-node` only)
