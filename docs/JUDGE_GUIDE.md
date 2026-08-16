# Judge guide — Reachable

**Track 02A · supply chain blast radius · solo.** Everything below is reproducible from a clean
clone with Docker + Python 3.11+ + Node 20+ (`make venv` builds the worker env from `requirements.txt`). Nothing on any page is estimated; every number is
recorded in a committed JSON with the statement that produced it.

## 90-second path

1. Open the console (deployed link in README, or `make up` → http://localhost:3000) → click **MAL-2025-46974** (debug@4.4.2).
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
| 1 | Which services are transitively exposed? | incident page, Q1 table; service page path | `MATCH (bad:Version {id})<-[:RESOLVED]-(l:Lockfile)<-[:HAS_LOCKFILE]-(s:Service)` — RESOLVED is the flattened install tree, so membership is one hop; **`algo.SPpaths`** for the proving chain; **`algo.MSpaths`** N versions × M services in one call | `make incident ID=<id>` | 888 ms cold / 7.06 ms warm p50 (MAL-2025-46974, 5 runs); MSpaths 699 ms cold / 0.72 ms warm |
| 2 | Which version introduced it? | incident page, Q2 table | `…-[:AFFECTS]->(v:Version) RETURN … ORDER BY v.published_at ASC LIMIT 1` (the engine has no `min()`); `Version.removed` from the registry’s time-vs-versions orphan rule | same | 9.05 ms |
| 3 | Which apps resolved the bad version **while it was live**? ★ | incident page, Q3 timeline + table | one query per incident: `WHERE r.at >= af.live_from AND r.at <= af.live_to` — two **relationship** properties compared in-engine; second evidence class `WHERE v.removed = true` (pinning an erased version is only possible while live) | same | 4.81 ms · 6 rows |
| 4 | Which packages share maintainers/infrastructure? ★ | incident page, Q4 | `(bad)-[:VERSION_OF]->(:Package)<-[:MAINTAINS]-(m)-[:MAINTAINS]->(other)` then per package `…<-[:RESOLVED]-(l)<-[:HAS_LOCKFILE]-(s) RETURN s.key, count(*)` (grouping key = the `count(DISTINCT)` substitute) | same | 13.6 s (8 of 32 packages computed, stated cap) |
| 5 | Likely typosquats nearby? ★ | incident page, Q5 | `NAME_SIMILAR_TO` is **materialised at ingest** (Damerau-Levenshtein 1 — 2 for names ≥ 8 chars — plus scope/hyphen/homoglyph/affix kinds) so proximity is a traversal, not a scan | `make ingest ARGS="--only typosquats"` | 2.6 ms |
| 6 | Complete blast radius | the incident page | all of the above composed by `worker/reachable/incident.py` with per-query ms | `make incident ID=<id> ARGS=--out` | `worker/out/<id>.json` |
| + | Which of these actually need action? | Q1 verdict column; service page | `File`/`CONTAINS`/`IMPORTS` from a first-party import scan at the exact exposed commit → L0/L1; `unscanned` when we could not read the source | `make ingest ARGS="--only reach"` | — |

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
- The demo cohorts are disclosed in `demo/services.txt`: 8 well-maintained repos + 4 real victims of
  the 2025-09-08 incident found by code-searching the malicious tarball names + 1 added via the console.
- Q4 exposure is computed for the 8 most-downloaded co-maintained packages; the rest say "not computed".

## Reproduce

```bash
make venv && make node          # terminal 1: HydraDB (Docker), stays in the foreground — leave it running
make node-test && make test     # terminal 2: golden tests on a throwaway node (:17687); they load their own fixture
make up                         # terminal 2: worker api (:8787, background) + web build + web (:3000)
make add REPO=owner/repo        # terminal 3: one ingest job (lockfiles · packages · advisories · reach); waits, prints step timings
make demo                       # replays demo/services.txt (13 repos, as jobs) then demo/incidents.txt (reports)
make incident ID=<advisory> ARGS="--out --runs 5"   # ARGS=, not a bare --out (make eats it as --output-sync)
make reset                      # stop the node, archive .hydradb/store + cache, then `make node` again
make down                       # stop the background api
```

`GITHUB_TOKEN` (and `HYDRA_TOKEN`) are read from `.env` — copy `.env.example`. HTTP responses are
disk-cached under `.cache/`, so a re-run is write-bound, not network-bound.

`make add` and `make incident` need the production node from terminal 1 on `7687`; `make test`
uses only the throwaway test node on `17687` (`make node-test-stop` removes it) so the fixture
never touches the ingested graph.
