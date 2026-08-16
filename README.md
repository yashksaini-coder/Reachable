# Reachable

Supply chain incident response on a graph.

When an npm package is compromised, answer in seconds: which services are
transitively exposed, which resolved the bad version *while it was live*, which
packages share maintainers, which nearby names are typosquats — and, the
differentiator, **which of those exposures are actually reachable from
first-party code**.

```
17 services exposed  ·  3 actually reachable  ·  14 safe until Monday
```

Built for [Hack Hydra](https://hackhydra.hydradb.com/) Track 02A on
[HydraDB open source](https://github.com/hydra-db/hydradb) — OpenCypher over
Bolt, with `algo.MSpaths` doing the blast-radius traversal in the database.

Status: **Phase 0** — see [`AGENTS.md`](./AGENTS.md) §12.

## Attribution

- [HydraDB](https://github.com/hydra-db/hydradb) — graph engine (AGPL-3.0, run as a separate process)
- [npm registry API](https://registry.npmjs.org/) — versions, maintainers, publish times
- [deps.dev](https://deps.dev/) — resolved dependency graphs
- [OSV](https://osv.dev/) — advisories

## Licence

MIT — see [`LICENSE`](./LICENSE).
