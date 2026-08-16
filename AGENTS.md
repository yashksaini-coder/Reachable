# AGENTS.md

Canonical instructions for any AI agent working in this repository.
`CLAUDE.md` points here — **this file is the source of truth.** Update it here, not there.

---

## 1. What this project is

**Reachable** — supply chain incident response on a graph.

When an npm package is compromised, answer in seconds: which services are
transitively exposed, which resolved the bad version while it was live, which
packages share maintainers with it, which nearby names are typosquats, and — the
differentiator — which of those exposures are *actually reachable* from
first-party code and need action tonight.

Built for **Hack Hydra** (Aug 12–20, 2026), Track 02A. Solo project.
Full plan: `docs/spec-v3.md`. Read it before making architectural decisions.

Surfaces: web console (primary) · README badge (`/badge/{owner}/{repo}.svg`).
**There is no desktop app.** The CLI (`npx reachable-scan`) was cut on 2026-08-16
after the competitor review — not on the never-cut list, ~3 h, and the badge covers
the third-surface story. Do not propose either.

---

## 2. Rules that can disqualify us 🔴

These are hackathon rules, not preferences. Violating any one voids the submission.

1. **No commits dated before August 12, 2026.** Judges read commit history.
   Never use `--date`, `--amend` to rewrite dates, or `GIT_COMMITTER_DATE`.
2. **No code written before August 12, 2026.** Public libraries, frameworks,
   APIs, datasets and AI assistants are all fine. Prior personal code is not.
3. **An OSS licence must be in the repo.** It is in the first commit. Do not
   remove it.
4. **The repo stays public.**
5. **Attribute everything borrowed** in the README — libraries, APIs, datasets.
6. **HydraDB must do real work.** Never work around it by computing graph
   results in Python and using HydraDB as a blob store. Traversal runs in the
   database. This is both a rule and the core of our pitch.

---

## 3. The two HydraDBs — read this before touching any DB code ⚠️

There are **two different products** with the same name. Confusing them is the
single most likely way to waste hours here.

| | ❌ NOT this | ✅ THIS |
|---|---|---|
| Name | HydraDB hosted/cloud | HydraDB open source |
| Where | `docs.hydradb.com`, `api.hydradb.com` | `github.com/hydra-db/hydradb` |
| Interface | REST `/query`, `/context/ingest` | **OpenCypher** over Bolt / HTTP |
| Graph writes | `graph_payload` / BYOG | `UNWIND` + `MERGE` |
| Client | `hydradb-sdk`, `@hydradb/sdk` | **`neo4j` driver** (Bolt 5.x) |
| Concepts | collections, memories, `alpha`, `mode` | labels, relationships, procedures |

**If you find yourself writing `BYOG`, `graph_payload`, `collection`,
`app_knowledge`, `type: "memory"`, `mode: "thinking"`, or importing
`hydradb-sdk` — stop. That is the wrong product.**

Web search and model priors will surface the hosted docs first. Ignore them.
Authoritative sources for this project, in order:

1. The cloned repo's own `README.md`, `AGENTS.md`, `CLAUDE.md`, `architecture.md`
2. `cypher-compat.md` in that repo — the supported OpenCypher subset
3. A probe query against our running local node (see §6)

**Nuance added 2026-08-16 after reading the official Participant Guide.** The
guide's resources page lists `docs.hydradb.com` ("start here when you are
building"), `dashboard.hydradb.com` and `research.hydradb.com` as legitimate
event resources alongside the OSS repo. So those domains are not radioactive —
they are one vendor documenting both a hosted service and an engine. What stays
true is narrower and still binding: **nothing on those sites governs the API
shape of the OSS engine.** Read them for background, benchmarks and account
keys; never for query syntax, driver choice or write patterns. The marker list
above is unchanged — `graph_payload`, BYOG, collections and `hydradb-sdk` remain
proof you have drifted onto the hosted product. Ranking above is unchanged too:
repo docs, then `cypher-compat.md`, then a probe against the running node.

---

## 4. Stack

| Layer | Tech | Notes |
|---|---|---|
| Graph | HydraDB OS (`graph-node`) | Rust, AGPL-3.0, self-hosted, S3/local object store |
| Access | `neo4j` Python driver over Bolt | `bolt://127.0.0.1:7687 — `bolt://`, not `neo4j://` (that triggers routing discovery)` |
| Worker | Python 3.11+ (developed and tested on 3.14.7) | ingestion, queries, incident composition |
| Web | Next.js App Router + Tailwind + shadcn/ui | server-side DB access only |
| Deploy | Vercel (web) + small VM (graph-node) | precomputed JSON as fallback |

Data sources: `registry.npmjs.org` (versions, maintainers, publish times) ·
`api.deps.dev` (resolved dependency graphs) · `api.osv.dev` (advisories) ·
`package-lock.json` v3 · `git log` · tree-sitter (JS/TS only).

---

## 5. Repo layout

```
docs/
  spec-v3.md           the plan (its §4 data model is superseded by schema.md)
  schema.md            THE frozen graph schema — labels, properties, id scheme
  JUDGE_GUIDE.md       90-second path + six-question table for judges
  hack-hydra-participant-guide.pdf   the official rules (source for §13)
worker/
  reachable/
    db.py              driver + env; the only place HYDRA_TOKEN is read (env, with .env auto-loaded)
    http.py            cached HTTP GET/POST for the sources
    ids.py             gid()/eid() integer ids, safe_purl() allowlist
    fixture.py         ~30-node hand-verified test graph, loaded via UNWIND
    sources/           npm.py osv.py github.py (lockfile history) reach.py (L0/L1 import scan)
                       depsdev.py (present, NOT used by the pipeline — DEPENDS_ON comes from lockfiles)
    typosquat.py       materialises NAME_SIMILAR_TO edges
    load.py            UNWIND MERGE write primitives, idempotent by deterministic id
    pipeline.py        bulk ingest (--seeds demo/services.txt, six resumable stages: services,
                       packages, advisories, reach, typosquats, verify) and --repo owner/repo
    jobs.py            per-repo ingest jobs: one worker thread + queue, steps lockfiles ·
                       packages · advisories · reach; history in .cache/jobs.jsonl
    api.py             loopback HTTP api: /ask/*, /cypher, /services, /services/add (job),
                       /jobs, /graph/stats
    queries.py         Q1–Q7, one function each, typed results
    incident.py        composes the six answers into one payload
  tests/               golden-file tests against the fixture (test_queries.py)
  out/                 incident JSON written by `make incident … ARGS=--out` (the web contract; empty until it runs)
benchmarks/results/    provenance-stamped timing JSON, same command (created on first --out)
scripts/               probe.py, roundtrip.py — Phase 0 harnesses, kept
web/
  app/                 / · /incident/[advisory] · /incident/[advisory]/[service] · /badge/[owner]/[repo] · /api/health
  lib/                 env.ts (server-only) · incident.ts (loads worker/out JSON)
demo/services.txt      12 demo repos in two disclosed cohorts (8 core + 4 real victims), replayed by
                       `make demo` as `make add` jobs — not configuration the code reads
demo/incidents.txt     the demo advisory ids, replayed as `make incident … --out`
requirements.txt       pinned worker deps · pyproject.toml holds only ruff/pytest config
.env.example           copy to .env / web/.env.local; both are gitignored
```

There is deliberately **no `schema/` directory and no `.cypher` files.** The
engine has no DDL (§8), and its writes need bound `UNWIND` parameters that a
flat `.cypher` file cannot carry. The schema is a table in `docs/schema.md`
plus the id functions in `ids.py`; the fixture is Python.

---

## 6. Commands

```bash
make venv        # python venv from requirements.txt
make node        # start local graph-node with correct env (foreground)
make node-stop   # docker stop the node          make node-logs   # follow its logs
make roundtrip   # write + read one node over Bolt (node health check)
make probe       # run the Cypher feature probe against the node
make fixture     # (re)load the hand-verified fixture graph (fx/acme keys; wipes only its own edges)
make up          # api (:8787, background, pid .cache/api.pid) + web build + web (:3000); needs the node
make down        # stop the background api
make add REPO=owner/repo   # one ingest job via the api (waits, prints step timings); inline if api is down
make demo        # replay demo/services.txt as jobs, then demo/incidents.txt as reports
make reset       # docker stop the node, archive .hydradb/{store,cache} -> *.old-<time>; then make node
make ingest      # bulk pipeline over demo/services.txt; ARGS="--only <stage>" for one stage (typosquats/verify live here)
make incident ID=GHSA-xxxx-yyyy-zzzz              # print the report
make incident ID=… ARGS="--out --runs 5"          # + write worker/out/<id>.json and benchmarks/results/
make lint        # ruff
make test        # lint + pytest against fixture (needs a running node) + NEXT_PUBLIC leak check
make api         # worker api in the foreground
make web         # next dev
make web-build   # npm ci && next build
```

Extra flags go through `ARGS=` — a bare `make incident ID=x --out` is silently
eaten by make itself (`--out` abbreviates `--output-sync`) and writes nothing.

If a command doesn't exist yet, create it in the `Makefile` rather than
documenting a raw one-liner. One entry point per task.

---

## 7. Running graph-node — known footguns

These are documented failure modes from the HydraDB README. Check here first
when the node misbehaves.

| Symptom | Cause |
|---|---|
| Serves `/readyz`, then aborts with stack overflow on first query | `RUST_MIN_STACK` unset — export `33554432` |
| `No available formula "libcypher-parser"` | macOS needs the tap: `brew install cleishm/neo4j/libcypher-parser` |
| `invalid environment variable CLOUD_PROVIDER value 'null'` | Unset. `local` also requires `LOCAL_PATH` pointing at an **existing** directory |
| `'cypher-parser.h' file not found` | macOS, `cargo` invoked directly without `BINDGEN_EXTRA_CLANG_ARGS` — prefer `just` |
| `curl: (7) failed to connect :9090` | Node isn't running; it holds the foreground, use a second shell |

Required env: `CLOUD_PROVIDER` · `LOCAL_PATH` · `GRAPH_NAMESPACE` · `GRAPH_ID` ·
`GRAPH_CELL_ID` · `GRAPH_CELLS` · `GRAPH_NODE_ID` · `GRAPH_BOLT_NODE_ADDRESSES` ·
`GRAPH_ADVERTISED_BOLT_ADDR` · `GRAPH_DATA_CACHE_DIR` · `GRAPH_AUTH_TOKEN_FILE` ·
`GRAPH_ALLOW_PLAINTEXT=true` (local only) · `RUST_MIN_STACK=33554432`

Ports: Bolt `7687` · HTTP `8443` · admin `9090`.

**A listening port is not proof the node works. A round-tripped write is.**

---

## 8. Unverified surface — probe, don't assume ⚠️

HydraDB supports a *practical OpenCypher subset*, not all of Cypher. The
following are **assumptions in the spec that must be verified against a running
node** before being built on. Mark each ✅ here once confirmed.

Verified 2026-08-16 by `make probe` against a live node (HydraDB `0.1.0`,
`ghcr.io/hydra-db/hydradb:latest`, neo4j driver 6.2.0). Full detail and exact
syntax live in `.claude/skills/hydradb-cypher/SKILL.md`.

- [x] `algo.MSpaths` argument names — **`relDirection: 'incoming'` works.**
      Accepts `'incoming'` / `'outgoing'` / `'both'`, default `'outgoing'`.
      The Q1 reverse-closure design survives intact.
- [x] `CREATE INDEX` exact syntax — **no DDL at all.** Both the 3.x and 4.x
      forms are rejected; `graph-indexer` builds indexes in the background.
- [x] Bounded variable-length `*1..8` with a rel-type filter — works. Engine
      caps hops at **16**.
- [x] `OPTIONAL MATCH` + aggregation — works **only with `count(*)`**.
      `count(b)` is rejected, as are `min` / `max`. Q4 must be rewritten to
      `count(*)` or `collect(...)`.
- [x] Relationship properties in `MERGE` — works, in the `UNWIND` form.
- [x] Practical `UNWIND` batch size — **hard cap 1024 rows**; 1025 is refused
      by admission control. Measured 1000 rows in 9–17 ms (~60k–113k rows/s).
- [x] `consistency: "strong"` via Bolt — **not reachable from the Python
      driver.** HydraDB refuses explicit transactions, which is the only place
      the driver exposes metadata. Use the HTTP API for that one query.

Four further findings that constrain the schema, all newly discovered:

- [x] **Node and relationship ids must be non-negative integers.** Purls must be
      hashed to ints; the human key lives in a property.
- [x] **Relationships need their own id** in `UNWIND ... MERGE`.
- [x] **All property writes go through `UNWIND`** — plain `MERGE ... SET` is
      rejected.
- [x] **`MSpaths.sourceValues` must be inline string literals** — parameters and
      integers are both refused, so values are interpolated into query text.
      This is a Cypher-injection surface fed by registry data; validate npm
      names against a strict allowlist and reject, never escape.

### Second probe round — 2026-08-16 afternoon (three parallel probe agents)

Everything below was run against the live node. Full detail in the
`hydradb-cypher` skill; this is the list that shapes queries.

**Comparisons and WHERE**
- [x] **Property-vs-property comparison works** — node-vs-node, rel-vs-node,
      rel-vs-rel, all six operators, `AND`/`OR`/`NOT`. Q3's window predicate
      `r.at >= af.live_from AND r.at <= af.live_to` runs unmodified in-engine.
- [x] Comparison operands must be the **same type family**. One string
      timestamp in an int column errors the whole query. Missing property →
      `null` → row silently dropped, no error. Coerce to int at ingest, assert
      coverage.
- [x] `WHERE` evaluates **zero arithmetic** — `n.ts >= $from + 100` refused.
- [x] `<relationship>.id` is unusable in `WHERE`/`RETURN`/`ORDER BY` (parsed as
      a node-id expression → `unbound variable r`). Mirror it as `r.eid`.
- [x] A node's `id` is the vertex id, **not a property** — `'id' in node` is
      `False`. Every node stores its human key as `key`.

**Aggregates and RETURN**
- [x] `ORDER BY … LIMIT 1` works as a `min()`/`max()` substitute, including
      across a var-length traversal. Multi-key `ORDER BY`, `SKIP`, `LIMIT` fine.
- [x] `sum()` and `avg()` **work** (previously listed unverified).
- [x] `count(*)` with a grouping key works. `count(x)`, `min`, `max`,
      `count(DISTINCT …)`, `collect(DISTINCT …)` refused. `collect(v)` of a
      whole node refused — scalar properties only.
- [x] `RETURN` supports `<binding>.<property>`, `count(*)`, `sum`, `avg`,
      `collect`, and **nothing else** — no literal constants, no arithmetic,
      no `CASE`, no `coalesce`, no `toString`, no `id(n)`, no `labels(n)`.
      Anything the UI shows must be a stored property.
- [x] `WITH` exists but is pass-through only. `UNION`/`UNION ALL` work
      (3 arms verified) — but a trailing `ORDER BY`/`LIMIT` after `UNION`
      applies to the **last arm only**, silently. Sort every arm, or in Python.

**Variable-length paths**
- [x] The **source of a var-length segment must be an inline integer literal.**
      `{id: $param}` refused; a node bound by an earlier hop or an earlier
      `MATCH` refused: `variable-length MATCH requires a fixed source id`.
      Format the int into the query text; assert `isinstance(v, int)` there.
- [x] An **incoming** var-length (`<-[*1..8]-(x)`) is refused unless `x` also
      appears in a second pattern segment (comma pattern or next `MATCH`).
      Outgoing has no such rule. Mechanism unknown; the empirical rule holds
      across 15 probes. Q3/Q4 always continue to `Lockfile`, so unaffected.
- [x] `MATCH p = …` path binding and `length(p)` are refused. Hop counts come
      from `len(path.relationships)` on an `algo.*` result, or not at all.

**algo.MSpaths / SSpaths / SPpaths**
- [x] It is a **complete standalone query**: `CALL algo.X({…}) YIELD path
      RETURN path` and nothing may follow — no `WHERE`, `WITH`, `MATCH`,
      `LIMIT`. Filtering the blast radius happens client-side.
- [x] **`pathCount` defaults to 1.** Omit it and a 40-fanout node returns one
      path and looks correct. Required argument in our helper.
- [x] **`resultLimit` truncates silently** — `has_more` is `False` in both the
      truncated and complete case, no notification. Always request `N+1`,
      treat `len(rows) > N` as capped, render a banner.
- [x] `sourceLabel`, `sourceProperty`, `sourceValues`, `relTypes` must be
      inline literals; every scalar (`maxLen`, `pathCount`, `resultLimit`,
      `relDirection`, `maxCost`, `sourceNode`, `targetNode`) may be a bound
      parameter. `SSpaths`/`SPpaths` take integer node ids as parameters — no
      string interpolation at all; prefer them when the id is known.
- [x] Unknown source value, label, or relType → **0 rows, no error.**
      Relationship types are case-sensitive and fail the same way.
- [x] Measured on a 250-node fixture: single-source bounded traversal
      0.25–3.11 ms; 250 sources / 1000 paths 71–86 ms; a fresh string property
      worked as a selector immediately (graph-indexer indexes on write).
      **Not measured at real scale — pitch numbers stay `TBD` until Phase 3.**
- [x] Ids: full signed-64 range accepted; `2^63` refused. We use **52 bits** so
      JSON never loses precision in the browser.

**Ingestion**
- [x] Edge-write `MATCH` endpoints need **exactly one label each.**
- [x] `SET` values must read from the row map — `SET n.dead = true` refused;
      `SET n.dead = row.dead` fine. Booleans round-trip.
- [x] Delete works: `UNWIND $rows AS row MATCH (n {id: row.id}) DETACH DELETE n`
      — the pattern must carry **no** label. `UNWIND MATCH` must end in
      `RETURN` or `DELETE`, so no `REMOVE`.

- [x] **N-arm `UNION` scales linearly and buys nothing.** 84 arms parse and
      run (200 arms / 62 KB verified) but cost is per-arm: 84-arm UNION 664 ms
      vs 84 sequential single-arm queries 766 ms on the fixture. Q3's
      transitive arm stays a per-version loop — simpler, same speed.

### Third round — 2026-08-16 evening, against the REAL graph (8 services, 110 lockfiles, 6k packages, 69k versions)

The fixture was ~100× too sparse to show any of this. Every item below reshaped a query.

- [x] **`RESOLVED` is the flattened install tree**, so "does this lockfile pull in X" is
      one hop (**17 ms** for 110 lockfiles / 8 services). The transitive `*1..8` arms the
      spec drafted for Q1/Q3/Q4 were redundant — and fatal, see next two items.
- [x] **Incoming var-length from a popular version explodes**: `MATCH (bad {id})<-[:DEPENDS_ON*1..8]-…`
      hits the 30 s query timeout even at `*1..1`; targeted `MSpaths` with `pathCount: 1000`
      is refused by admission control: `native_path_frontier_paths … 250001 exceeds limit 250000`.
- [x] **Untargeted `MSpaths` from a bad version returns 0 services**: 1000 partial
      `DEPENDS_ON` paths saturate `resultLimit` before any reaches a `Service`. Always pass
      `targetLabel/targetProperty/targetValues` and keep `pathCount` small.
- [x] **`algo.SPpaths(sourceNode, targetNode, …)` with integer-id parameters** yields the
      proving chain (`bad ← DEPENDS_ON ← dep ← RESOLVED ← lockfile`) in **600 ms cold /
      1 ms warm**, `pathCount: 3`. This is Q1's explanation, with zero literal surface.
- [x] **Latency is bimodal — cold vs warm.** Same targeted MSpaths: **5.4 s cold, 2 ms
      warm**. Object-store-native engine; the first touch pages data in. Every quoted
      number carries a cold/warm label or is `TBD`. `incident.py --runs N` records both.
- [x] **Whole-type edge counts time out** past ~100k edges — labelled or not
      (`cypher_relationship_edge_records exceeded query timeout`). Never
      `MATCH (a)-[r:RESOLVED]->(b) RETURN count(*)`; count small types only, log big
      ones at write time.
- [x] **Node deletion by id is a full scan**: `MATCH (n {id}) DELETE n` ≈ **1.3 s per row**
      at 25k nodes; `DETACH DELETE` the same. Edge deletion (both ends id-anchored) is 5 ms.
      Design so node deletion is never needed; the fixture wipe deletes edges only.
- [x] **`null` is not a valid `UNWIND` parameter** ("only boolean, signed integer, finite
      float, and string"). `load.py` omits `None`-valued properties per row.
- [x] `RETURN … ORDER BY` with an aggregate cannot reference row properties:
      `aggregate ORDER BY cannot reference row properties`. Sort in Python.
- [x] Anonymous labelled nodes need a name: `(:Lockfile)` refused (`node labels and
      non-id properties require a named node`); write `(l:Lockfile)`.

- [x] **Whole-label node counts are refused past 250k nodes**: `MATCH (n:Version) RETURN
      count(*)` → `cypher_vertex_label_index_candidates rejected by admission control:
      actual 250001 exceeds limit 250000`. Same for `WHERE key STARTS WITH` over a big
      label. Anchor by id, or count at write time. (`incident.provenance` reports `null`.)
- [x] **Targeted `MSpaths` explodes on the target side too**: with real `Service` targets,
      `maxLen ≥ 3` over `DEPENDS_ON+RESOLVED+HAS_LOCKFILE` hits the 30 s timeout
      (`native_path_target_frontier`); `maxLen: 2` over `RESOLVED+HAS_LOCKFILE` is exact
      (RESOLVED is the closure) and runs in ~5 ms warm / ~1.8 s cold on the real graph.
- [x] Relationship delete needs **anonymous endpoints and one edge type**:
      `MATCH (a {id})-[r:T]->(b {id}) DELETE r` works; labels or an edge id in the
      pattern are refused. `n.id` IS readable in `MATCH`/`RETURN` (only `<rel>.id` is not).

Still unverified: HTTP `consistency: "strong"` round trip · weighted paths.

**Workflow when unsure:** add a case to `make probe` and run it. Ten seconds of
probing beats an hour of debugging a wrong assumption. Never infer support from
Neo4j documentation — different engine.

---

## 9. Working conventions

### Verification before claiming

Do not report a query, command, or feature as working unless you ran it and saw
the output. If something is untested, say so explicitly. Fabricated confidence
costs more time than admitted uncertainty.

### Numbers

Every latency, node count, or throughput figure in the README, UI, or video must
come from an actual measurement. **Never invent or estimate a benchmark number.**
If unmeasured, write `TBD`.

### Query development order

1. Write it against `fixture.cypher` (~30 nodes, answers verifiable by hand)
2. Confirm the result by hand
3. Add a golden-file test
4. Only then run it against the ingested graph

Never debug a new query shape against the full dataset.

### Ingestion

Idempotent (`MERGE`, never blind `CREATE`) · resumable · HTTP responses cached to
disk. Assume the pipeline will be re-run many times.

### Secrets

Never commit the auth token, API keys, or `.env`. Maintain `.env.example`.
In Next.js, **anything prefixed `NEXT_PUBLIC_` is bundled into client JS** — the
graph auth token must never carry that prefix. All DB access is server-side.

### Commits

Small, focused, present tense. Commit working state frequently — this is a solo
sprint with no one to unbreak it.

### Honest scoping

The reachability analysis is static, import- and symbol-level, JS/TS only.
Dynamic `require()`, re-export chains and reflection are not resolved.
`VULNERABLE_SYMBOL` edges are LLM-inferred and must be tagged `inferred: true`
and rendered differently. **Never let the UI or README overclaim this.** Infra
judges have done static analysis; overclaiming loses more than scoping honestly.

---

## 10. Scope guard

### Build

Six incident queries · temporal lockfile model · maintainer graph · typosquat
edges · reachability filter · web console (3 routes) · CLI · badge.

### Do not build

Desktop app · languages beyond JS/TS · ecosystems beyond npm · GitHub OAuth or
App install · auto-fix PR generation · user accounts, teams, billing ·
open-ended autonomous agents · a force-directed graph explorer (tempting,
least necessary).

### Cut order when behind

1. Graph explorer → 2. Eval harness → 3. Reachability L2 (keep L0/L1) →
4. CLI worm check → 5. Typosquat panel → 6. Live chat

**Applied 2026-08-16 (competitor review, owner-approved):** graph explorer, eval
harness, L2, the **whole CLI**, typosquat *panel* (Q5 stays in the JSON and the
incident page shows near-names with their kind, labelled as a hypothesis), live
chat. Deploy is JSON-first on Vercel; a public graph-node only if it lands in
< 2 h.

**Never cut:** the six queries · the incident page · the badge · the video.

---

## 11. Definition of done

Before reporting any task complete:

- [ ] Ran it; saw the actual output
- [ ] `make test` passes
- [ ] No secrets added; `.env.example` updated if config changed
- [ ] Any new assumption about HydraDB's Cypher support was probed, and §8 updated
- [ ] Committed

---

## 12. Status

> Keep this current. It is how a fresh agent session knows where things stand.

**Current phase:** Phases 0–4 and 6 (L0/L1) built; real ingest of 12 seeds in
progress; Phase 5 (differentiator UI) mostly landed with the console; next are
the first real incident JSON, README, deploy, video.

**Last verified working (2026-08-16 evening):**
`make node` · `make fixture` · `make test` (11 golden tests, lint, leak check) ·
`make incident ID=MAL-TEST-1` on the fixture · `make ingest` services + packages
stages against real GitHub/npm/OSV data (8 core + 4 victim repos, ~6.2k packages,
~110 lockfile snapshots; three real lockfiles pin `debug@4.4.2` / `chalk@5.6.1`
inside or after the 2025-09-08 window) · `web/` builds and prerenders from
committed JSON.

**Known open items:** ingest stages advisories→reach→typosquats→verify must
complete on the real graph; `worker/out/*.json` and `benchmarks/results/*` are
empty until `make incident … --out` runs with the ingest idle; README is a stub;
no deploy; no video. `docs/JUDGE_GUIDE.md` has `see benchmarks/results/` where
numbers belong — fill from measurements only.

**Decisions this session:** RESOLVED is the closure (transitive arms removed
everywhere); Q3 has two in-engine evidence classes (in_window, pinned_removed);
`unscanned` is a first-class verdict; CLI cut; chalk/debug is the primary
incident, TanStack the Q2 story; every payload section carries the executed
Cypher and its limitations.

Phases: 0 engine · 1 model · 2 ingestion · 3 queries · 4 web · 5 differentiators
· 6 reachability · 7 badge · 8 deploy · 9 submission.
See `docs/spec-v3.md` for each phase's goal, done-when, and cut-if-late.

---

## 13. Deadline and submission

**August 20, 2026, 11:59 PM PT.** Submission needs three things, all required:
public repo · demo video **≤ 3:00** · completed form.

Reserve time for submission a full day early. Open every link yourself in a
private window before submitting — broken links are the most common way people
lose. The guide says it outright: *"Most disqualifications are a missing link,
not a weak project."*

Form: <https://forms.gle/GrMYKxLj9zPQcqqc8>. The `forms.gle/WEwqEmmN7Bkp4HyJ6`
link that circulated earlier resolves to the **same** form — verified 2026-08-16,
both redirect to `docs.google.com/forms/d/e/1FAIpQLSdXpGqgsxPKRlaii1MXjlFCAfKYRBOxO8xa801LmT6z65IejA`.
Either is safe.

### Straight from the official Participant Guide

**The video has a prescribed running order** — four beats, in this sequence:
the problem · the project (what you built) · the demo (show it working) ·
HydraDB (where it is used, and why it matters). Our script in `docs/spec-v3.md`
§7 already follows this order. Do not reorder it to be clever.

**The repo must carry**, and judges must find without asking for access:
complete source · OSS licence · no participant-authored commits before Aug 12 ·
a clear README · setup and run instructions that *actually work* · an
explanation of how HydraDB is used · dependency and environment information ·
attribution.

**The form asks for** project name and short description · the problem · what
you built · deployed link (if any) · how the project uses HydraDB · tech stack ·
team members and contributions · repo and video links. Write the README so
these are copy-paste, not composed under deadline pressure.

**Track 02 has no mandated dataset.** Tracks 01 and 03 ship one; ours says bring
your own — so `seeds.yaml` and every source in §6 **must be disclosed in the
README**. That is a stated rule, not politeness.

**Track 02 is scored on precision, recall, query latency and cost**, with ground
truth from OSV and the GitHub Advisory Database. Latency we already measure.
**Cost is the lever nobody else will pull** — HydraDB is object-store-native, so
a per-query cost or bytes-scanned figure from the admin endpoint is a cheap,
on-theme differentiator. Only report it if it is measured.

Balance this against the judging line, which is explicit and in our favour:
*"We care about working, thoughtful products, not just benchmark scores."*
Product first, always. And the guide's closing advice, which is the cut order in
one sentence: *"Stop adding features before the deadline. Test what you already
built."*
