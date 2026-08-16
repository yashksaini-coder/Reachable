# Ask — the typed-question grammar

There is no language model behind **Ask**. A question is matched against a small grammar; each
shape maps to one verified statement, and the card under every answer shows exactly which. If a
question does not parse, the page tells you the shapes it knows.

| you type | it runs | what comes back |
|---|---|---|
| `is owner/repo exposed to MAL-2025-46974` · `who is exposed to GHSA-…` | Q1 membership over `RESOLVED`, plus `algo.SPpaths` for the proving path | services, lockfile shas, commit times, the dependency that pulled it in |
| `who resolved MAL-2025-46974 while it was live` | Q3, one predicate over the `AFFECTS` window and the `RESOLVED` time | lockfile commits with evidence `in window` / `pins removed` |
| `what pulls chalk into owner/repo` | `algo.SPpaths` from the package's versions to that service's lockfiles | the chain(s), hop count, per lockfile |
| `which services depend on debug@4.4.2` | exact version, one hop | services and lockfiles pinning it |
| `which versions does MAL-2025-46974 affect` | Q2 | versions, publish times, removed flag, window kind |
| `maintainers of MAL-2025-46969` | Q4 | maintainers and the co-maintained packages, with services resolving each today |
| `typosquats near chalk` | `NAME_SIMILAR_TO` | near-names with kind and edit distance |
| `MATCH (s:Service) RETURN s.key AS service LIMIT 20` | read-only Cypher | the rows; statements must start with `MATCH`/`CALL`, contain no writes, and are capped at 200 rows |

Identifiers are recognised by shape: advisory ids (`MAL-`, `GHSA-`, `CVE-`), `owner/repo`
slugs, `package@version`, bare package names (including scoped `@scope/name`).

An empty result renders a grey `none` chip with an honest sentence, never a blank area.
