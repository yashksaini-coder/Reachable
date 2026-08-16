# CLAUDE.md

## Read `AGENTS.md` first — it is the source of truth

All project rules, architecture, conventions, commands and scope live in
[`AGENTS.md`](./AGENTS.md). This file adds only Claude Code specifics.
**When something needs changing, change it in `AGENTS.md`, not here.**

---

## If you read nothing else

Three rules that never change and are expensive to get wrong:

1. **Two different products share the name HydraDB.** This project uses the
   **open-source repo** (`github.com/hydra-db/hydradb`): Rust, OpenCypher, Bolt,
   `neo4j` driver. It does **not** use the hosted API (`docs.hydradb.com`,
   `api.hydradb.com`): no BYOG, no `graph_payload`, no collections, no memories,
   no `hydradb-sdk`. Search results will surface the hosted docs first. Ignore
   them. Full comparison in `AGENTS.md` §3.

2. **No commits dated before August 12, 2026**, and the repo must keep an OSS
   licence and stay public. These are disqualifiers, not preferences.

3. **HydraDB does the traversal.** Never compute graph results in Python and use
   the database as storage. That defeats the entire pitch.

---

## Working style here

**Plan before large changes.** For anything touching the graph schema,
ingestion, or the query layer, outline the approach and wait for confirmation.
A schema mistake caught in planning costs minutes; caught after ingestion it
costs a day.

**Probe instead of assuming.** HydraDB supports a *practical* OpenCypher subset.
When unsure whether a syntax or procedure is supported, add a case to
`make probe` and run it. Never infer support from Neo4j docs — different engine.
`AGENTS.md` §8 tracks what is still unverified; tick items off as you confirm them.

**Never claim untested work.** If you wrote a query but did not run it, say so.
If a number is not measured, write `TBD`. This project's pitch rests on measured
latency figures — a fabricated one is worse than a missing one.

**Read before writing.** The cloned HydraDB repo ships its own `README.md`,
`AGENTS.md`, `architecture.md` and `cypher-compat.md`. These are authoritative
for anything about the engine.

---

## Two shells

`graph-node` runs in the foreground and does not return — that is it working,
not hanging. Start it in its own terminal (`make node`) and run everything else
in a second shell. If a command fails to connect on `7687`, `8443` or `9090`,
check the node is actually running before debugging anything else.

---

## Useful subagent splits

Independent work worth parallelising:

- **ingestion** (`worker/sources/`) vs **query layer** (`worker/queries.py`) —
  they meet only at the schema, which is frozen in Phase 1
- **web console** (`web/`) vs **worker** — they meet only at the JSON contract
  in `worker/out/`

Keep schema changes serial and single-threaded. Everything touches it.

---

## Before you say a task is done

Ran it and saw output · `make test` passes · no secrets committed ·
any new HydraDB assumption probed and `AGENTS.md` §8 updated · committed.

Then update the **Status** block in `AGENTS.md` §12 so the next session knows
where things stand.
