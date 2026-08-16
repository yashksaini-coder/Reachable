# AGENTS.md

Canonical instructions for any AI agent working in this repository.
`CLAUDE.md` points here — **this file is the source of truth.** Update it here, not there.

---

## 1. What this project is

**Blast Radius** — supply chain incident response on a graph.

When an npm package is compromised, answer in seconds: which services are
transitively exposed, which resolved the bad version while it was live, which
packages share maintainers with it, which nearby names are typosquats, and — the
differentiator — which of those exposures are *actually reachable* from
first-party code and need action tonight.

Built for **Hack Hydra** (Aug 12–20, 2026), Track 02A. Solo project.
Full plan: `docs/spec-v3.md`. Read it before making architectural decisions.

Surfaces: web console (primary) · CLI (`npx blast-radius scan`) · README badge.
**There is no desktop app.** Do not propose one.

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

---

## 4. Stack

| Layer | Tech | Notes |
|---|---|---|
| Graph | HydraDB OS (`graph-node`) | Rust, AGPL-3.0, self-hosted, S3/local object store |
| Access | `neo4j` Python driver over Bolt | `neo4j://127.0.0.1:7687` |
| Worker | Python 3.11+ | ingestion, queries, incident composition |
| Web | Next.js App Router + Tailwind + shadcn/ui | server-side DB access only |
| CLI | Node, published via `npx` | reads local lockfiles |
| Deploy | Vercel (web) + small VM (graph-node) | precomputed JSON as fallback |

Data sources: `registry.npmjs.org` (versions, maintainers, publish times) ·
`api.deps.dev` (resolved dependency graphs) · `api.osv.dev` (advisories) ·
`package-lock.json` v3 · `git log` · tree-sitter (JS/TS only).

---

## 5. Repo layout

```
schema/
  schema.cypher        indexes + constraints — apply before any ingest
  fixture.cypher       ~30-node hand-verified test graph
worker/
  blast_radius/
    config.py          env loading, no hardcoded secrets
    db.py              driver wrapper, retries, query timing
    sources/           npm.py depsdev.py osv.py lockfile.py
    typosquat.py       materialises NAME_SIMILAR_TO edges
    load.py            batched UNWIND MERGE, idempotent, resumable
    queries.py         Q1–Q7, one function each, typed results
    incident.py        composes the six answers into one payload
    cli.py
  tests/               golden-file tests against fixture.cypher
  out/                 precomputed incident JSON (committed)
web/
  app/                 / · /incident/[advisory] · /incident/[advisory]/[service]
  lib/                 server-only DB + data loading
cli/                   npx blast-radius
docs/spec-v3.md        the plan
seeds.yaml             the 6–8 seed repos
```

---

## 6. Commands

```bash
make node        # start local graph-node with correct env (foreground)
make probe       # run a minimal Cypher feature probe against the node
make schema      # apply schema/schema.cypher
make fixture     # wipe + load schema/fixture.cypher
make ingest      # full pipeline from seeds.yaml
make incident ID=GHSA-xxxx-yyyy-zzzz
make test        # pytest against fixture
make web         # next dev
```

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

- [ ] `algo.MSpaths` argument names — especially `relDirection`. README shows
      `'both'`; the spec assumes `'incoming'` works for reverse closure.
- [ ] `CREATE INDEX` exact syntax
- [ ] Bounded variable-length paths `*1..8` with a relationship type filter
- [ ] `OPTIONAL MATCH` + aggregation in the same query (used by Q4)
- [ ] Relationship properties in `MERGE` patterns
- [ ] Practical batch size for `UNWIND` writes
- [ ] `consistency: "strong"` via the Bolt driver

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

**Current phase:** Phase 0 — prove the engine runs
**Blocked on:** —
**Last verified working:** —

Phases: 0 engine · 1 model · 2 ingestion · 3 queries · 4 web · 5 differentiators
· 6 reachability · 7 CLI+badge · 8 deploy · 9 submission.
See `docs/spec-v3.md` for each phase's goal, done-when, and cut-if-late.

---

## 13. Deadline

**August 20, 2026, 11:59 PM PT.** Submission needs three things, all required:
public repo · demo video **≤ 3:00** · completed form.

Reserve time for submission a full day early. Open every link yourself in a
private window before submitting — broken links are the most common way people
lose.
