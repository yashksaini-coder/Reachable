# Judge guide — Reachable

**Track 02A · supply chain blast radius · solo.** Everything below is reproducible from a clean
clone with Docker + Python 3.11+ + Node 20+. Nothing on any page is estimated; every number is
recorded in a committed JSON with the statement that produced it.

## 90-second path

1. Open the deployed console (link in README) → click the **chalk / debug** incident.
2. Read the headline: services exposed · resolved **while live** · reachable (L2) · imported (L1) ·
   present only (L0) · **unscanned** (we never call an unscanned service safe).
3. Scroll to **Q3** — the timeline strip. Orange bar = the window the malicious artifact was
   installable (dashed edge = upper bound, npm publishes no takedown time). Amber ticks = lockfile
   commits *inside* the window. Red ticks = lockfiles that pin a version npm has since erased.
   Real repos, real commit shas, real timestamps.
4. Expand any **“How HydraDB answered this”** card. That is the Cypher / `algo.*` call actually
   sent over Bolt, with rows and wall-clock ms (cold and warm). It is generated from the executed
   statement, not typed into the page.
5. Click a service → the **proving path**: `bad version ← DEPENDS_ON ← … ← RESOLVED ← lockfile`,
   returned by `algo.SPpaths` — the engine explains *why*, we do not reconstruct it.

## The six track questions → where each is answered

| # | Track question | Surface | In-engine mechanism (executed statement is on the card) | Command | Measured |
|---|---|---|---|---|---|
| 1 | Which services are transitively exposed? | incident page, Q1 table; service page path | `MATCH (bad:Version {id})<-[:RESOLVED]-(l:Lockfile)<-[:HAS_LOCKFILE]-(s:Service)` — RESOLVED is the flattened install tree, so membership is one hop; **`algo.SPpaths`** for the proving chain; **`algo.MSpaths`** N versions × M services in one call | `make incident ID=<id>` | see `benchmarks/results/` |
| 2 | Which version introduced it? | incident page, Q2 table | `…-[:AFFECTS]->(v:Version) RETURN … ORDER BY v.published_at ASC LIMIT 1` (the engine has no `min()`); `Version.removed` from the registry’s time-vs-versions orphan rule | same | same |
| 3 | Which apps resolved the bad version **while it was live**? ★ | incident page, Q3 timeline + table | one query per incident: `WHERE r.at >= af.live_from AND r.at <= af.live_to` — two **relationship** properties compared in-engine; second evidence class `WHERE v.removed = true` (pinning an erased version is only possible while live) | same | same |
| 4 | Which packages share maintainers/infrastructure? ★ | incident page, Q4 | `(bad)-[:VERSION_OF]->(:Package)<-[:MAINTAINS]-(m)-[:MAINTAINS]->(other)` then per package `…<-[:RESOLVED]-(l)<-[:HAS_LOCKFILE]-(s) RETURN s.key, count(*)` (grouping key = the `count(DISTINCT)` substitute) | same | same |
| 5 | Likely typosquats nearby? ★ | incident page, Q5 | `NAME_SIMILAR_TO` is **materialised at ingest** (Damerau-Levenshtein 1, scope/hyphen/homoglyph/affix kinds) so proximity is a traversal, not a scan | `make ingest` (stage `typosquats`) | — |
| 6 | Complete blast radius | the incident page | all of the above composed by `worker/reachable/incident.py` with per-query ms | `make incident ID=<id> --out` | `worker/out/<id>.json` |
| + | Which of these actually need action? | Q1 verdict column; service page | `File`/`CONTAINS`/`IMPORTS` from a first-party import scan at the exact exposed commit → L0/L1; `unscanned` when we could not read the source | `make ingest` (stage `reach`) | — |

## What HydraDB does that a table could not

- **Lockfile is a node.** Exposure is a fact *as of a commit*. Because each `package-lock.json`
  snapshot is a time-stamped node whose `RESOLVED` edges are the flattened tree npm wrote, “who
  resolved it while it was live” is a single predicate over two relationship properties. A
  relational schema needs a bitemporal join per affected version.
- **One `algo.MSpaths` call** takes every compromised version and every service in a single
  reverse traversal (`relDirection: 'incoming'`); the proving path comes back from the engine.
- **The window lives on the `AFFECTS` edge**, not the version node — a version hit by two
  advisories has two windows; only an edge can carry that.
- **Deterministic 52-bit ids** (`blake2b(key) >> 12`) make every ingest idempotent and every id
  exactly representable in browser JSON.

## What we learned about the engine (all probed, none assumed)

`AGENTS.md §8` lists 60+ verified facts. The ones that shaped the design: ids must be integers ·
`MERGE` matches id only, label via `SET`, every value from the `UNWIND` row · no `CREATE INDEX`
(graph-indexer indexes on write) · `count(*)`/`collect`/`sum`/`avg` only, no `min`/`max`/`DISTINCT`
in aggregates · var-length source must be an inline integer literal · `algo.MSpaths` `pathCount`
defaults to 1 and `resultLimit` truncates silently · `RESOLVED`-as-closure makes incoming
var-length unnecessary (and it explodes: 250k-path frontier cap) · latency is bimodal (object
store: cold vs warm) · whole-type edge counts and node deletes are full scans.

## Honest limits

- `live_to` is an **upper bound** — npm publishes no takedown timestamp. Rendered as such on every row.
- `twofa` / `account_created` are **not exposed** by the public registry — shown as unknown, never guessed.
- Reachability is **L0/L1** (import-level). L2 (symbol-level, tree-sitter) was cut for time.
- `Version.removed` proves *a* removal, not *why*; `malicious` is set only when an advisory says so.
- Typosquat candidates come from the ingested corpus; distance and kind are facts, “typosquat” is a hypothesis.
- Seed cohorts are disclosed in `seeds.json`: 8 well-maintained repos + 4 real victims of the
  2025-09-08 incident found by code-searching the malicious tarball names.

## Reproduce

```bash
make venv && make node          # terminal 1: HydraDB (Docker), stays in the foreground
make fixture && make test       # terminal 2: 11 hand-verified golden tests
make ingest                     # seeds.json -> graph (network-bound first time; disk-cached after)
make incident ID=<advisory> --out
make web-build && cd web && npm start
```
