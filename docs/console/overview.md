# Overview

Reachable is a supply-chain incident console. When an npm package is compromised, one page
answers six questions about **your** services — from the graph, not from a spreadsheet:

1. **Which services are transitively exposed?** — every watched repository whose
   `package-lock.json` resolved an affected version, at any commit, with the dependency that
   pulled it in and the proving path.
2. **Which version introduced it?** — exact publish times from the registry, whether npm has
   since erased the version, and the *installable window*.
3. **Which apps resolved it while it was live?** — lockfiles committed inside the window
   (evidence `in window`) or pinning a version npm has erased (`pins removed`), which is only
   possible while it was live.
4. **What else do the same maintainers publish?** — the next blast radius, ranked by weekly
   downloads, with the services resolving each package today.
5. **Which look-alike names exist?** — names one edit away, scope confusion, hyphen and
   homoglyph variants, materialised at ingest so proximity is a traversal.
6. **What is the complete blast radius?** — the ledger per service with a verdict.

## Verdicts

| level | meaning | colour |
|---|---|---|
| **L2 act now** | first-party code references the affected package's vulnerable symbol | red |
| **L1 imported** | first-party code imports the package; the symbol is not referenced | amber |
| **L0 present only** | in the install tree, never imported by any scanned file | green |
| **unscanned** | exposed, but its source was not read — styled as unknown, never as safe, never counted as zero | grey |

Verdict colours mean their verdict and nothing else. Orange is the only free accent.

## What every number carries

Each answer card has a **hydradb** strip: the exact OpenCypher / `algo.*` statement that was
executed, the row count, and wall-clock latency (cold and warm when both were measured). The
strip can be collapsed but never hidden. Numbers are measured, never estimated; where a value is
not computed it says `— not computed`, where a bound is a bound it says `upper bound`.

## What Reachable is not

- Not an LLM. Questions typed on the **Ask** page are parsed by a small grammar into one of eight
  verified statements; you always see which.
- Not a scanner of your source beyond imports (L0/L1). Symbol-level reachability (L2) exists for
  advisories that name a symbol; it is stated when it is only a hypothesis.
- Not a hosted service. It is single-tenant and self-hosted; whoever runs the node owns the graph.
