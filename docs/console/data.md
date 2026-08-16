# Data sources and honesty rules

Everything is fetched live from public sources and disk-cached under `.cache/`; nothing is
invented and no number is estimated.

| source | what we take |
|---|---|
| **GitHub REST API** | `package-lock.json` commit history and contents per watched repository; the repository tree for the import scan; code search for "beyond the watched set" |
| **registry.npmjs.org** | versions, publish times (the `time` map survives version removal — that is how `removed` and exact `live_from` are known), maintainers |
| **api.npmjs.org** | weekly downloads (unscoped packages) |
| **OSV.dev** | advisories (`MAL-*`, `GHSA-*`, `CVE-*`), affected ranges expanded against the ingested versions |

## The installable window

`live_from` is exact (npm keeps the publish timestamp after erasing a version). `live_to` is an
**upper bound**: npm publishes no takedown time, so we use the earlier of the next surviving
publish and the advisory's published time, and say `upper bound` wherever it applies. Two evidence
classes follow: `in window` (a lockfile committed inside the window — it does not prove an install
happened) and `pins removed` (a lockfile pins a version npm has since erased, which is only
possible while it was live — commit time is irrelevant).

## Caps that are stated, never hidden

- Q4 exposure is computed for the eight most-downloaded co-maintained packages; the rest read
  `— not computed`.
- Explanation paths are the three shortest per lockfile, not all of them.
- Whole-graph counts are refused by the engine above certain sizes; the Graph page says so instead
  of showing a stale number.
- `twofa` / `account_created` are not exposed by the public registry — shown as unknown.
- Reachability is import-level (L0/L1) from a regex scan of first-party JS/TS at the exposed
  commit; symbol-level (L2) is only claimed when an advisory names a symbol and the scan finds it.

## Cohorts

The watched set is disclosed in `demo/services.txt`: eight well-maintained repositories, four
real victims of the 2025-09-08 npm incident found by code-searching the malicious tarball names,
and anything added through the console.
