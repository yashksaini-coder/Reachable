# How it works

{{figure:how.png|How Reachable works — sources in, one graph, six answers out}}

Reachable reads public sources, writes one graph into HydraDB, and answers the six incident
questions by traversing that graph. Nothing on a report card is computed in Python from rows the
database handed back: the walk happens in the engine, and the executed statement is printed
under the answer. This chapter follows the data from source to verdict, and ends with what the
engine turned out to be.

## The pipeline

{{diagram:pipeline}}

Watching a repository is a four-step job in the worker (`worker/reachable/pipeline.py`):

1. **Lockfiles** — GitHub's commit history for `package-lock.json` (npm lockfileVersion 2 and 3)
   or `pnpm-lock.yaml` (pnpm 6.x and 9.x) at the repository root. Every commit becomes a
   `Lockfile` node stamped `committed_at`; the flattened install tree the package manager wrote
   becomes `RESOLVED` edges to `Version` nodes, and each entry's own dependencies become
   `DEPENDS_ON` edges. yarn and bun lockfiles are refused, not guessed.
2. **Packages** — for every package the lockfiles mention, `registry.npmjs.org` gives versions,
   publish times and maintainers, and `api.npmjs.org` gives weekly downloads. The registry's
   `time` map keeps a version's publish timestamp after the artifact is erased, which is how
   `Version.removed` and an exact `live_from` are known.
3. **Advisories** — OSV.dev records (`MAL-*`, `GHSA-*`, `CVE-*`) whose affected ranges are
   expanded against the versions actually in the graph. Each match is an `AFFECTS` edge that
   carries the installable window.
4. **Import scan** — first-party JavaScript and TypeScript at the exposed commit, read through
   the GitHub tree API and matched against import and require forms. Matches become `File`
   nodes with `CONTAINS` and `IMPORTS` edges.

A fifth stage, run over the whole corpus, materialises `NAME_SIMILAR_TO` edges between packages
whose names sit within a small edit distance, so look-alike lookup is a traversal later rather
than a scan.

The graph the guide's numbers come from holds {{stat:provenance.graph.Service|int}} services,
{{stat:provenance.graph.Lockfile|int}} lockfile snapshots, {{stat:provenance.graph.Package|int}}
packages, {{stat:provenance.graph.Version|int}} versions, {{stat:provenance.graph.Advisory|int}}
advisories and {{stat:provenance.graph.Maintainer|int}} maintainers. All writes are idempotent
`MERGE`s keyed on a deterministic 52-bit hash of the human key, so re-running a job changes
nothing that was already there.

## The graph model

{{diagram:schema}}

Seven ingested labels, nine relationship types (the fixture-only `Symbol` edges are not
drawn); the frozen definition is in
[Graph schema](/docs/reference/schema). Three details carry most of the weight:

- **Ids are integers, keys are strings.** HydraDB requires non-negative integer ids for nodes
  and relationships. Every node stores its purl-shaped human key (`pkg:npm/debug@4.4.2`,
  `svc:owner/repo`, `lock:owner/repo@sha`) in `key`; the id is `blake2b(key) >> 12`, 52 bits so
  that JSON in the browser never loses precision. Relationships mirror their id into `eid`
  because `r.id` is not usable in `WHERE` or `RETURN`.
- **The installable window lives on `AFFECTS`.** `live_from` is the version's publish time,
  exact. `live_to` is the earlier of the next surviving publish and the advisory's own publish
  time — an `upper bound`, because npm publishes no takedown time; `live_to_kind` says which
  kind of bound it is (`upper_bound`, `unbounded` for CVEs and unbounded malware, and `exact`
  is reserved and never written today). A version hit by two advisories has two windows; only an
  edge can hold that.
- **`RESOLVED.at` is the lockfile's commit time**, copied onto the edge so the while-live test
  is one comparison between two edge properties and never needs a second hop.

`NAME_SIMILAR_TO` carries `kind` (`scope`, `hyphen`, `homoglyph`, `prefix_suffix`, `insertion`,
`deletion`, `transposition`, `substitution`, `edit2`) and `distance` (1 or 2). Timestamps are
integer epoch seconds throughout: the engine has no date functions and refuses to compare a
string against an integer.

## Q1 — which services are transitively exposed

{{diagram:q1-walk}}

Because `RESOLVED` is the flattened install tree, transitive membership is exact in one hop:
any lockfile with a `RESOLVED` edge to an affected version resolved it, however deep the package
sat in the tree. The membership statement:

{{cypher:q1_exposed}}

The first statement lists services and lockfiles; the `algo.SPpaths` calls that follow ask, per
lockfile, for up to three shortest chains of `DEPENDS_ON` and `RESOLVED` edges from the affected
version back to the lockfile — the *proof* that the report shows as
`debug@4.4.2 ← DEPENDS_ON ← eslint@8.57.1 ← RESOLVED ← lockfile`. Paths come back from the
engine; the worker never reconstructs them.

For the many-to-many form — every affected version against every watched service — one
`algo.MSpaths` call does the whole fan-out:

{{cypher:q1_mspaths}}

Measured for this incident: the membership query and its `algo.SPpaths` proofs returned
{{stat:q1_exposed.lockfiles|int}} exposed lockfiles across
{{stat:headline.services_exposed|int}} services in {{stat:q1_exposed.timing.cold_ms|ms}} cold
and {{stat:q1_exposed.timing.warm_p50_ms|ms}} warm (median of
{{stat:q1_exposed.timing.runs|int}} runs, p95 {{stat:q1_exposed.timing.warm_p95_ms|ms}}). The
`MSpaths` call over {{stat:q1_mspaths.sources|int}} source and {{stat:q1_mspaths.targets|int}}
targets returned {{stat:q1_mspaths.paths|int}} paths in {{stat:q1_mspaths.timing.cold_ms|ms}}
cold and {{stat:q1_mspaths.timing.warm_p50_ms|ms}} warm. Cold is the first run after the node
was idle; warm is every run after. Both are reported and neither is estimated.

## Q2 — which version introduced it

{{cypher:q2_versions}}

The engine has no `min()`, so the first affected version is `ORDER BY v.published_at ASC LIMIT 1`.
The second statement returns every affected version with its publish time, the `removed` flag
and the window from the `AFFECTS` edge. `removed` is true when the registry still lists a
publish time for a version that is no longer in its `versions` map — proof that npm erased it,
not of why. For this incident the first affected version is
`{{stat:q2_versions.first.version}}`, and the statement ran in {{stat:q2_versions.ms|ms}}.

## Q3 — which apps resolved it while it was live

{{diagram:q3-window}}

This is the question that a lockfile grep cannot answer. Both timestamps it needs already sit
on edges, so the whole test is one predicate in the engine:

{{cypher:q3_while_live}}

Two evidence classes come back, and the report labels each row:

- **in window** — the lockfile's `RESOLVED.at` falls between `live_from` and `live_to`. It
  proves the lockfile pinned the version while it was installable; it does not prove an install
  ran on any machine.
- **pins removed** — the second statement: the lockfile pins a version npm has since erased.
  That is only possible while the version was live, so commit time is irrelevant, and this
  class survives even when `live_to` is loose.

Because `live_to` is an `upper bound`, an in-window commit near the end of the window may in
truth have happened after takedown; the report says so on the row rather than tightening the
bound. For this incident: {{stat:q3_while_live.in_window|int}} lockfile commits inside the
window and {{stat:q3_while_live.pinned_removed|int}} pinning an erased version, in
{{stat:q3_while_live.ms|ms}}. Q3 is offered only for malware advisories; for a CVE the artifact
stays on the registry and "while live" collapses into "at all".

## Q4 — what else the same maintainers publish

{{diagram:q4-fanout}}

Two hops out from the affected package through its maintainers, then back down through
`VERSION_OF`, `RESOLVED` and `HAS_LOCKFILE` to see which watched services resolve each
co-maintained package today:

{{cypher:q4_maintainers}}

The fan-out statement lists 32 co-maintained packages for this incident. Exposure is then
computed for the eight most-downloaded of them, one statement per package with `count(*)`
grouped by service; the remaining packages are listed with their download counts and read
`— not computed`. That is a stated cap, not an approximation: on a prolific maintainer the full
set takes tens of seconds, and this incident's Q4 took {{stat:q4_maintainers.ms|ms}} as it
stands. "Services at risk" here means services that resolve the co-maintained package now — the
exposure if that package is compromised next, not exposure to this incident. `twofa` and
`account_created` are requested but the public registry does not expose them; they render as
unknown.

## Q5 — which look-alike names exist

{{diagram:q5-nearnames}}

Near-name proximity is materialised at ingest as `NAME_SIMILAR_TO` edges from a suspect
package to a popular one, so at question time the lookup is a one-hop traversal from the
affected package with `distance` and `kind` read off the edge, joined to the suspect's
maintainers:

{{cypher:q5_typosquats.pkg:npm/debug}}

It ran in {{stat:timing_ms.q5|ms}}. Distance and kind are facts; "typosquat" is a hypothesis.
A `scope` neighbour such as `@types/debug` is a legitimate package that happens to sit one edit
away, and the report shows it with the same chip as anything else — the reader, not the graph,
decides. Candidates come only from the ingested corpus, so a look-alike that no watched
lockfile ever pulled in is not in the graph and cannot be listed.

## Q6 — the blast radius, and what is actually reachable

Q6 is the composition: `worker/reachable/incident.py` runs Q1 to Q5 in one pass, records the
statement, row count and wall-clock milliseconds of each, and writes the JSON the report renders
(`worker/out/<advisory>.json`). Total for this incident, Q4 included:
{{stat:timing_ms.total|ms}}.

The verdict on each exposed service comes from the reachability scan:

- **L2 act now** — first-party code references the vulnerable symbol the advisory names. No
  ingest stage writes `Symbol` nodes today; L2 exists in the test fixture and is claimed only
  when an advisory names a symbol and the scan finds it.
- **L1 imported** — a first-party file has an `IMPORTS` edge to the affected package.
- **L0 present only** — the package is in the install tree and no scanned file imports it.
- **unscanned** — the service is exposed but no `File` nodes exist for it. It is styled as
  unknown, never as safe, and never counted as zero.

What the scan does: lists JavaScript and TypeScript files at the exposed commit (skipping
`node_modules`, build output and vendored directories, up to a per-repository file cap), reads
them, and matches `import … from`, bare `import`, `require(...)`, dynamic `import(...)` and
`export … from` against the packages the advisory names, mapping subpath imports to their
package. What it does not prove: it is a regex over source text, not a parser, so it cannot tell
a call from a mention, cannot follow re-exports, and says nothing about code paths at runtime.
An L0 verdict means "not imported by any scanned file"; it is not a clean bill. For this
incident the three exposed services scanned {{stat:headline.present_only_L0|int}} at L0,
{{stat:headline.imported_L1|int}} at L1, {{stat:headline.reachable_L2|int}} at L2 and
{{stat:headline.unscanned|int}} unscanned; the per-service file counts and statements are on the
report card.

## What we learned about the engine

Every item below was verified against a running node with `make probe`; the full list is in
`AGENTS.md`.

- Node and relationship ids must be non-negative integers, so purls are hashed and the human
  key lives in a `key` property; relationships need their own id, mirrored into `eid`.
- There is no DDL: `CREATE INDEX` is rejected in every form and `graph-indexer` indexes
  properties on write — a fresh property worked as a selector immediately.
- All property writes go through `UNWIND $rows AS row …`, hard-capped at 1024 rows per
  statement (the loader batches at 1000); plain `MERGE … SET` is refused, and `SET` values must read from the row map.
- `WHERE` compares property against property across nodes and relationships, which is what
  makes Q3 one predicate — but operands must share a type family, a missing property silently
  drops the row, and `WHERE` evaluates no arithmetic.
- `RETURN` supports bound properties, `count(*)`, `sum`, `avg` and `collect` and nothing else:
  no literals, `CASE`, `coalesce`, `min` or `max`. `ORDER BY … LIMIT 1` stands in for
  `min`/`max`; anything the console shows must be a stored property.
- Bounded variable-length patterns work up to 16 hops, but the source must be an inline integer
  literal and an incoming var-length needs a second pattern segment; `MATCH p = …` and
  `length(p)` are refused, so hop counts come from `algo.*` results.
- `algo.MSpaths` / `SSpaths` / `SPpaths` are complete standalone queries: nothing may follow
  `YIELD path RETURN path`, so filtering happens client-side. `relDirection: 'incoming'` works.
- `pathCount` defaults to 1 and `resultLimit` truncates silently, so the helper always sets
  `pathCount` and requests one more row than it will show.
- `sourceValues`, labels and relationship types must be inline literals — a Cypher-injection
  surface fed by registry data, closed by a strict allowlist that rejects rather than escapes.
- `UNION` works, but a trailing `ORDER BY`/`LIMIT` applies to the last arm only, and an N-arm
  `UNION` costs the same as N statements; Q3's per-version loop stays a loop.
