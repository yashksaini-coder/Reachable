"""The six answers, one typed function each. Every traversal runs inside HydraDB.

Engine rules that shape every query here (AGENTS.md §8):
- var-length source must be an inline INTEGER literal — never a parameter, never a bound node
- algo.* is a complete statement; filtering happens after YIELD in Python
- MSpaths pathCount defaults to 1 and resultLimit truncates silently -> both handled in _mspaths
- no min/max/DISTINCT-in-aggregate -> ORDER BY LIMIT 1, and dedupe via grouping keys
- no literal constants in RETURN -> levels/labels are attached in Python
"""

from dataclasses import dataclass, field

from reachable.db import timed
from reachable.ids import cypher_str_list, gid

MAX_HOPS = 8


def _int(v) -> int:
    """The one place an id is formatted into query text. The assert IS the injection defence."""
    assert isinstance(v, int) and v >= 0, v
    return v


@dataclass
class Result:
    rows: list[dict]
    ms: float
    truncated: bool = False
    meta: dict = field(default_factory=dict)


# ---------------------------------------------------------------- Q2 · which version


def q2_affected_versions(s, advisory_key: str) -> Result:
    """Which version introduced it: earliest affected version + the full affected list."""
    a = _int(gid(advisory_key))
    first, ms1 = timed(
        s,
        f"MATCH (a:Advisory {{id: {a}}})-[:AFFECTS]->(v:Version) "
        "RETURN v.key AS version, v.published_at AS published_at "
        "ORDER BY v.published_at ASC LIMIT 1",
    )
    all_, ms2 = timed(
        s,
        f"MATCH (a:Advisory {{id: {a}}})-[af:AFFECTS]->(v:Version)-[:VERSION_OF]->(p:Package) "
        "RETURN p.key AS package, v.key AS version, v.published_at AS published_at, "
        "af.live_from AS live_from, af.live_to AS live_to, af.live_to_kind AS live_to_kind "
        "ORDER BY v.published_at ASC",
    )
    return Result(all_, ms1 + ms2, meta={"first": first[0] if first else None})


# ---------------------------------------------------------------- Q1 · reverse closure


def _mspaths(s, source_keys: list[str], *, limit: int, max_hops: int = MAX_HOPS) -> Result:
    """Reverse dependency closure from many sources in ONE engine call.

    resultLimit is requested as limit+1 so truncation is detectable — the engine
    reports has_more=False whether or not it truncated. pathCount is explicit
    because it silently defaults to 1.
    """
    q = (
        "CALL algo.MSpaths({sourceLabel: 'Version', sourceProperty: 'key', "
        f"sourceValues: {cypher_str_list(source_keys)}, "
        "relTypes: ['DEPENDS_ON', 'RESOLVED', 'HAS_LOCKFILE'], relDirection: 'incoming', "
        "maxLen: $maxlen, pathCount: $pathcount, resultLimit: $limit}) YIELD path RETURN path"
    )
    rows, ms = timed(s, q, maxlen=max_hops + 2, pathcount=limit, limit=limit + 1)
    truncated = len(rows) > limit
    return Result(rows[:limit], ms, truncated)


def q1_exposed_services(s, bad_version_keys: list[str], *, limit: int = 1000) -> Result:
    """Which services are transitively exposed, with the path that proves it.

    Path shape: Version(bad) <-DEPENDS_ON- ... <-RESOLVED- Lockfile <-HAS_LOCKFILE- Service.
    Only paths that reach a Service count; the rest are partial and dropped.
    """
    r = _mspaths(s, bad_version_keys, limit=limit)
    out: dict[str, dict] = {}
    for row in r.rows:
        # HydraDB returns a path as a flat list: [node_props, REL_TYPE, node_props, ...]
        # with no labels — the key prefix (svc:/lock:/pkg:) is the label.
        chain = [el["key"] for el in row["path"] if not isinstance(el, str)]
        if not chain[-1].startswith("svc:"):
            continue  # partial path that stopped before reaching a Service
        hops = (len(chain) - 1) - 2  # minus RESOLVED and HAS_LOCKFILE
        svc = chain[-1]
        prev = out.get(svc)
        if prev is None or hops < prev["hops"]:
            out[svc] = {
                "service": svc,
                "lockfile": chain[-2],
                "hops": hops,
                "path": chain,
                "bad_version": chain[0],
            }
    rows = sorted(out.values(), key=lambda d: (d["hops"], d["service"]))
    return Result(rows, r.ms, r.truncated, meta={"paths_scanned": len(r.rows)})


# ---------------------------------------------------------------- Q3 · resolved while live


def q3_resolved_while_live(s, advisory_key: str) -> Result:
    """Which lockfiles resolved an affected version INSIDE its live window.

    Arm 1 — direct: one query for the whole incident; the window predicate runs in-engine
    (relationship property vs relationship property, verified).
    Arm 2 — transitive: per affected version, closure via *1..8 then the same predicate.
    """
    a = _int(gid(advisory_key))
    direct, ms = timed(
        s,
        f"MATCH (a:Advisory {{id: {a}}})-[af:AFFECTS]->(v:Version)<-[r:RESOLVED]-(l:Lockfile)"
        "<-[:HAS_LOCKFILE]-(sv:Service) "
        "WHERE r.at >= af.live_from AND r.at <= af.live_to "
        "RETURN sv.key AS service, l.key AS lockfile, r.at AS resolved_at, v.key AS version, "
        "af.live_from AS live_from, af.live_to AS live_to, af.live_to_kind AS live_to_kind "
        "ORDER BY r.at ASC",
    )
    for d in direct:
        d["via"] = "direct"
    affected, ms2 = timed(
        s,
        f"MATCH (a:Advisory {{id: {a}}})-[:AFFECTS]->(v:Version) RETURN v.id AS vid, v.key AS key",
    )
    ms += ms2
    seen = {(d["service"], d["lockfile"], d["version"]) for d in direct}
    transitive: list[dict] = []
    for v in affected:
        rows, ms3 = timed(
            s,
            f"MATCH (bad:Version {{id: {_int(v['vid'])}}})<-[:DEPENDS_ON*1..{MAX_HOPS}]-(root:Version)"
            "<-[r:RESOLVED]-(l:Lockfile)<-[:HAS_LOCKFILE]-(sv:Service), "
            "(a:Advisory)-[af:AFFECTS]->(bad) "
            "WHERE r.at >= af.live_from AND r.at <= af.live_to "
            "RETURN sv.key AS service, l.key AS lockfile, r.at AS resolved_at, root.key AS via_root, "
            "af.live_from AS live_from, af.live_to AS live_to, af.live_to_kind AS live_to_kind",
        )
        ms += ms3
        for row in rows:
            k = (row["service"], row["lockfile"], v["key"])
            if k in seen:
                continue
            seen.add(k)
            transitive.append({**row, "version": v["key"], "via": "transitive"})
    return Result(
        direct + transitive, ms, meta={"direct": len(direct), "transitive": len(transitive)}
    )


# ---------------------------------------------------------------- Q4 · maintainer fan-out


def q4_maintainer_fanout(s, bad_version_key: str) -> Result:
    """Which OTHER packages share a maintainer with the compromised one, and who is exposed to those.

    Stage 1: maintainers of the bad package and every other package they maintain.
    Stage 2: per other-package version, services resolving it (traversal + dedup in-engine).
    """
    b = _int(gid(bad_version_key))
    stage1, ms = timed(
        s,
        f"MATCH (bad:Version {{id: {b}}})-[:VERSION_OF]->(p:Package)<-[:MAINTAINS]-(m:Maintainer)"
        "-[:MAINTAINS]->(other:Package)<-[:VERSION_OF]-(ov:Version) "
        "RETURN m.key AS maintainer, m.twofa AS twofa, p.key AS bad_package, "
        "other.key AS package, ov.id AS vid, ov.key AS version",
    )
    by_pkg: dict[str, dict] = {}
    for r in stage1:
        if r["package"] == r["bad_package"]:
            continue
        e = by_pkg.setdefault(
            r["package"],
            {"package": r["package"], "maintainers": set(), "services": set(), "versions": set()},
        )
        e["maintainers"].add((r["maintainer"], r["twofa"]))
        e["versions"].add(r["vid"])
    for e in by_pkg.values():
        for vid in e["versions"]:
            rows, ms2 = timed(
                s,
                f"MATCH (ov:Version {{id: {_int(vid)}}})<-[:RESOLVED]-(l:Lockfile)<-[:HAS_LOCKFILE]-(sv:Service) "
                "RETURN sv.key AS service, count(*) AS n",
            )
            ms += ms2
            e["services"].update(r["service"] for r in rows)
            rows, ms3 = timed(
                s,
                f"MATCH (ov:Version {{id: {_int(vid)}}})<-[:DEPENDS_ON*1..{MAX_HOPS}]-(root:Version)"
                "<-[:RESOLVED]-(l:Lockfile)<-[:HAS_LOCKFILE]-(sv:Service) "
                "RETURN sv.key AS service, count(*) AS n",
            )
            ms += ms3
            e["services"].update(r["service"] for r in rows)
    out = [
        {
            "package": e["package"],
            "maintainers": [{"login": m, "twofa": t} for m, t in sorted(e["maintainers"])],
            "services_at_risk": sorted(e["services"]),
        }
        for e in by_pkg.values()
    ]
    out.sort(key=lambda d: (-len(d["services_at_risk"]), d["package"]))
    maintainers = sorted({m for r in stage1 for m in [(r["maintainer"], r["twofa"])]})
    return Result(out, ms, meta={"maintainers": [{"login": m, "twofa": t} for m, t in maintainers]})


# ---------------------------------------------------------------- Q5 · typosquats


def q5_typosquats(s, package_key: str, *, max_distance: int = 2) -> Result:
    """Names within edit distance of the package, ranked by how suspicious they look."""
    p = _int(gid(package_key))
    rows, ms = timed(
        s,
        f"MATCH (suspect:Package)-[sim:NAME_SIMILAR_TO]->(popular:Package {{id: {p}}}) "
        "WHERE sim.distance <= $maxd "
        "MATCH (suspect)<-[:MAINTAINS]-(m:Maintainer) "
        "RETURN suspect.key AS package, suspect.downloads AS downloads, sim.distance AS distance, "
        "sim.kind AS kind, m.key AS maintainer, m.account_created AS account_created, m.twofa AS twofa "
        "ORDER BY sim.distance ASC, suspect.downloads ASC",
        maxd=max_distance,
    )
    return Result(rows, ms)


# ---------------------------------------------------------------- Q7 · reachability


def q7_reachability(s, advisory_key: str, service_key: str) -> Result:
    """L0 present-not-imported · L1 imported-symbol-unreferenced · L2 symbol referenced."""
    a, sv = _int(gid(advisory_key)), _int(gid(service_key))
    imports, ms = timed(
        s,
        f"MATCH (a:Advisory {{id: {a}}})-[:AFFECTS]->(v:Version)-[:VERSION_OF]->(p:Package)"
        f"<-[i:IMPORTS]-(f:File)<-[:CONTAINS]-(sv:Service {{id: {sv}}}) "
        "RETURN f.path AS path, i.line AS line, p.key AS package",
    )
    symbols, ms2 = timed(
        s,
        f"MATCH (a:Advisory {{id: {a}}})-[vs:VULNERABLE_SYMBOL]->(sym:Symbol)<-[u:USES_SYMBOL]-(f:File)"
        f"<-[:CONTAINS]-(sv:Service {{id: {sv}}}) "
        "RETURN f.path AS path, u.line AS line, sym.name AS symbol, vs.inferred AS inferred",
    )
    level = "L2" if symbols else "L1" if imports else "L0"
    return Result(
        [{"level": level, "imports": imports, "symbols": symbols}],
        ms + ms2,
        meta={"level": level},
    )
