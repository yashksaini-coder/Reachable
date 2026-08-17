# Why a graph

{{figure:why.png|Reachable — one traced route through a stack of packages}}

Reachable is a supply-chain incident console. When an npm package is compromised, one page
answers six questions about **your** services — from the graph, not from a spreadsheet. This
chapter is the argument for the graph; [How it works](/docs/how-it-works) shows each question
executing, and [Using it](/docs/using) walks the console.

## The incident, in one paragraph

On 2025-09-08 an npm maintainer was phished and 18 packages with over two billion combined
weekly downloads (`chalk`, `debug`, `ansi-styles`, …) shipped a crypto-clipper. The malicious
versions were installable for about 95 minutes. The advisory the guide uses throughout is
`{{stat:advisory.key}}` — "{{stat:advisory.summary}}", published {{stat:advisory.published_at_iso}};
the first affected version, `{{stat:q2_versions.first.version}}`, was published at
{{stat:q2_versions.rows.0.live_from_iso}}. Every team asked the same six questions, and most
answered them with grep over lockfiles and a spreadsheet. On the watched set of
{{stat:provenance.graph.Service|int}} services and {{stat:provenance.graph.Lockfile|int}} lockfile
snapshots, {{stat:headline.services_exposed}} services resolved a compromised version and
{{stat:headline.resolved_while_live}} did so while it was live.

## The six questions

Each one is a walk over a graph that changes with every commit — not a scan over a table.

1. **Which services are transitively exposed?** Every watched repository whose lockfile
   resolved an affected version, at any commit, with the dependency that pulled it in and the
   proving path. A table of direct dependencies cannot answer this; the answer *is* the chain
   `bad version ← DEPENDS_ON ← … ← RESOLVED ← lockfile ← HAS_LOCKFILE ← service`.
2. **Which version introduced it?** Exact publish times from the registry, whether npm has since
   erased the version, and the installable window — a property of the edge between the advisory
   and the version, because a version hit by two advisories has two windows.
3. **Which apps resolved it while it was live?** Not "do we depend on `debug`" but "did a
   lockfile pin `4.4.2` between the publish and the takedown". That is one predicate comparing
   two edge properties: the commit time on `RESOLVED` against the window on `AFFECTS`.
4. **What else do the same maintainers publish?** The next blast radius: version → package →
   maintainer → every other package → the services resolving each today. Two hops out, then the
   whole exposure walk again, per package, in one statement.
5. **Which look-alike names exist?** Names one edit away, scope confusion, hyphen and homoglyph
   variants. Proximity is materialised as an edge at ingest, so the question is a one-hop walk
   from the package rather than a string comparison over every name in the registry.
6. **What is the complete blast radius?** The ledger per service with a verdict — the five
   walks above composed, plus an import scan that says whether the exposure is reachable from
   first-party code.

{{diagram:six-questions}}

## What breaks without the graph

- **Question 3 is a bitemporal join per affected version in SQL.** Here it is one `WHERE`
  comparing two relationship properties, because the installable window lives on the `AFFECTS`
  edge and the lockfile commit time lives on the `RESOLVED` edge. On the guide incident it
  answers in {{stat:q3_while_live.ms|ms}}: {{stat:q3_while_live.pinned_removed|int}} lockfiles pin
  a version npm has since erased, {{stat:q3_while_live.in_window|int}} of them committed inside the window.
- **Question 1's proof comes back from the engine.** `debug@4.4.2 ← DEPENDS_ON ← agent-base@6.0.2
  ← RESOLVED ← lockfile` is a path returned by `algo.SPpaths`; the console never reconstructs
  paths from rows. Membership over the flattened `RESOLVED` closure, together with those
  proof paths, answers in
  {{stat:q1_exposed.timing.warm_p50_ms|ms}} warm (p50 of {{stat:q1_exposed.timing.runs|int}}
  runs; {{stat:q1_exposed.timing.cold_ms|ms}} cold, first run after the node was idle).
- **N affected versions × M services is one call.** `algo.MSpaths` takes every compromised version
  as a source and every service as a target in a single traversal —
  {{stat:q1_mspaths.sources|int}} source × {{stat:q1_mspaths.targets|int}} targets,
  {{stat:q1_mspaths.paths|int}} paths, {{stat:q1_mspaths.timing.warm_p50_ms|ms}} warm.
- **The graph is the same object the pipeline wrote.** {{stat:provenance.graph.Package|int}}
  packages, {{stat:provenance.graph.Version|int}} versions, {{stat:provenance.graph.Maintainer|int}}
  maintainers and {{stat:provenance.graph.Advisory|int}} advisories share one id scheme, so every
  ingest is a `MERGE` and every question starts from a key, not from a join plan.

Every number above is read from the committed report `worker/out/{{stat:advisory.key}}.json`,
generated {{stat:provenance.generated_at}} against `{{stat:provenance.hydradb_image}}`. Cold and
warm are both reported; neither is estimated.

## Verdicts, and the honesty rules

| level | meaning | colour |
|---|---|---|
| **L2 act now** | first-party code references the affected package's vulnerable symbol | red |
| **L1 imported** | first-party code imports the package; the symbol is not referenced | amber |
| **L0 present only** | in the install tree, never imported by any scanned file | green |
| **unscanned** | exposed, but its source was not read — styled as unknown, never as safe, never counted as zero | grey |

Verdict colours mean their verdict and nothing else. Orange is the only free accent.

Three phrases appear verbatim wherever they apply, and are never softened:

- `upper bound` — `live_to` is an upper bound. npm publishes no takedown time, so the window
  closes at the earlier of the next surviving publish and the advisory's published time.
- `not computed` — a value that was not measured says `— not computed`; it is never shown as
  zero. Question 4 computes exposure for the eight most-downloaded co-maintained packages and
  says so for the rest.
- `unscanned` — a service whose source was not read is `unscanned`. It is never green and never
  subtracted from the total.

Each answer card carries a **hydradb** strip: the exact OpenCypher or `algo.*` statement that
was executed, the row count, and wall-clock latency (cold and warm when both were measured). The
strip can be collapsed but never hidden.

## What Reachable is not

- Not an LLM. Questions typed on the **Ask** page are parsed by a small grammar into one of
  eight verified statements; you always see which.
- Not a scanner of your source beyond imports (L0/L1). Symbol-level reachability (L2) exists for
  advisories that name a symbol; it is stated when it is only a hypothesis.
- Not a hosted service. It is single-tenant and self-hosted; whoever runs the node owns the graph.
