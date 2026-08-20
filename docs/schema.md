# Reachable — graph schema (frozen 2026-08-16)

{{figure:reference.png|Reference — the graph, drawn to scale}}

Every construct here was verified against a
running HydraDB node before freezing (see `AGENTS.md` §8). Change it only with
a probe result in hand — a schema change after ingest means a full reload.

## Ids: integers, never purls

HydraDB node and relationship ids must be non-negative integers. So:

- **`id`** — the vertex/edge id, a deterministic 52-bit hash of the human key.
  It is *not* a readable property on nodes; use `key`.
- **`key`** — the human key string, stored as a property on every node.
  Selector lookups (`algo.MSpaths sourceProperty`) run against `key`.
- **`eid`** — on every relationship, a mirror of its `id`, because `r.id` is
  unusable in `WHERE`/`RETURN` (engine parses it as a node-id expression).

```python
gid(key) = int.from_bytes(blake2b(key, digest_size=8), "big") >> 12   # 52 bits
eid(src_key, rel_type, dst_key) = gid(f"{src_key}|{rel_type}|{dst_key}")
```

52 bits, not 63: the engine accepts the full signed-64 range, but the web
console is JavaScript and JSON numbers above 2^53 lose precision silently.
Python's builtin `hash()` is disqualified — `PYTHONHASHSEED` randomises it per
process, so every re-ingest would create duplicates instead of `MERGE`-ing.
Collision odds by birthday bound: ~1e-6 at 100k nodes. `load.py` keeps a
`gid → key` map and raises on a mismatched collision.

## Key formats (purl-shaped, unchanged from the spec)

```
pkg:npm/express                       Package
pkg:npm/express@4.18.2                Version
npm:sindresorhus                      Maintainer
GHSA-g7cv-rxg3-hmpx  ·  MAL-2026-3460 Advisory
svc:twbs/bootstrap                    Service
lock:twbs/bootstrap@a3f9c21           Lockfile
file:twbs/bootstrap:js/src/dom.js     File
sym:npm/qs@6.11.0#parse               Symbol
```

## Nodes

Every node has `id` (int, `gid(key)`) and `key` (string). Timestamps are
**int epoch seconds, UTC** — the engine has no date functions, and comparing a
string against an int errors the whole query.

| Label | Properties |
|---|---|
| `Package` | `name`, `ecosystem` (`'npm'`), `downloads` int (weekly; only on packages the `packages` stage enriched) |
| `Version` | `version`, `published_at` int, `removed` bool, `malicious` bool (only written `true`, by the `advisories` stage) |
| `Maintainer` | `login`, `email_domain`; `account_created` int and `twofa` bool exist in the fixture only — the public registry does not expose them, real ingest never writes them (`null` rows are dropped, never stored) |
| `Advisory` | `kind` (`'malware'` \| `'cve'`), `severity`, `severity_rank` int, `published_at` int, `summary` |
| `Service` | `name`, `repo_url`, `criticality` int |
| `Lockfile` | `committed_at` int, `sha`, `path` |
| `File` | `path`, `language` (`'javascript'` \| `'typescript'`, by extension) |
| `Symbol` | `name` — **fixture only**; L2 was cut, no ingest stage writes Symbol nodes |

`Version.removed` = the version key is present in the registry `time` map but
absent from `versions` — npm keeps the publish timestamp after erasing the
artifact. It proves *a* removal, not *why*; `malicious` is set only when an
advisory says so.

`Advisory.severity_rank` exists because you cannot `ORDER BY` a `CASE`, and
MAL records carry no CVSS. `critical=4 high=3 medium=2 low=1 unknown=0`.

## Relationships

Every relationship has `id` and `eid` (both `eid(src, type, dst)`).

| Type | Shape | Properties | Source |
|---|---|---|---|
| `VERSION_OF` | `(Version)→(Package)` | — | registry |
| `DEPENDS_ON` | `(Version)→(Version)` | `range` | lockfile (`packages[*].dependencies` + resolved path) |
| `MAINTAINS` | `(Maintainer)→(Package)` | — | registry |
| `AFFECTS` | `(Advisory)→(Version)` | **`live_from` int, `live_to` int, `live_to_kind`** | OSV + registry |
| `HAS_LOCKFILE` | `(Service)→(Lockfile)` | — | GitHub |
| `RESOLVED` | `(Lockfile)→(Version)` | **`at` int** (= lockfile `committed_at`) | lockfile |
| `CONTAINS` | `(Service)→(File)` | — | `sources/reach.py` — regex import scan of first-party JS/TS at the exposed commit (L0/L1) |
| `IMPORTS` | `(File)→(Package)` | `line` int | `sources/reach.py` |
| `USES_SYMBOL` | `(File)→(Symbol)` | `line` int | **fixture only** (L2 cut) |
| `VULNERABLE_SYMBOL` | `(Advisory)→(Symbol)` | `inferred` bool (always true) | **fixture only** (L2 cut) |
| `NAME_SIMILAR_TO` | `(Package)→(Package)` | `distance` int (1 or 2), `kind` (`scope` \| `hyphen` \| `homoglyph` \| `prefix_suffix` \| `insertion` \| `deletion` \| `transposition` \| `substitution` \| `edit2`) | `typosquat.py`, materialised at ingest (suspect → popular) |

## The temporal window — what "while it was live" means

The window lives on the **`AFFECTS` edge**, not on `Version`: a version hit
by two advisories has two windows, and only an edge can carry that. Q3 is then
one engine-side predicate: `RESOLVED.at BETWEEN AFFECTS.live_from AND live_to`.

| Field | Value | Honesty |
|---|---|---|
| `live_from` | registry `time[version]` | **exact** — npm keeps it after takedown |
| `live_to` | `min(next_surviving_version_publish, advisory_published)` for malware (only bounds `>= live_from` count); the sentinel `4102444800` (2100-01-01) = still live, used for every CVE and for malware with no bound | **upper bound** — npm publishes no takedown time anywhere |
| `live_to_kind` | `'upper_bound'` when a bound was found; `'unbounded'` with the sentinel (CVEs, or malware with no bound); `'exact'` reserved for a real takedown timestamp — npm never gives one, so it is never written today | rendered next to every window in the UI |

`Version.published_at` and `AFFECTS.live_from` are the same number by
construction; the duplication is deliberate so Q3 never needs a second hop.

Q3 is **only offered for `Advisory.kind = 'malware'`**. For an ordinary CVE the
artifact stays on the registry indefinitely, `live_to` is unbounded, and
"resolved while live" collapses into "resolved at all".

## Two decisions, defended

**`Lockfile` is a node.** A service's exposure is a fact *as of a commit*.
Each snapshot of `package-lock.json` is a `Lockfile` with `committed_at`, and
its `RESOLVED` edges are the flattened transitive tree npm actually installed —
so the closure for Q3 is already materialised per snapshot, and the question
becomes a join plus a window predicate. `algo.MSpaths` is for Q1, where the
deliverable is the *path*, not membership.

**`NAME_SIMILAR_TO` is materialised at ingest** so typosquat proximity is a
traversal, not a scan.

## Ingest rules the engine forces

- All writes are `UNWIND $rows AS row …`, ≤ 1000 rows per statement (hard cap 1024).
- `MERGE (n {id: row.id}) SET n:Label, n.key = row.key, …` — the MERGE pattern
  matches on id only, the label is applied in `SET`, every value from the row.
- Edge writes: `MATCH (a:LabelA {id: row.src}), (b:LabelB {id: row.dst}) MERGE (a)-[r:TYPE {id: row.rid}]->(b) SET r.eid = row.rid, …` — exactly one label per endpoint.
- No `CREATE INDEX` — graph-indexer indexes properties on write.
- Every timestamp coerced to int at the source boundary; ingest asserts non-null
  coverage on `published_at`, `live_from`, `live_to`, `at` before declaring done.
- Package names and versions pass `ids.safe_purl()` (strict allowlist, reject
  never escape) before they can reach an inline `sourceValues` literal.
