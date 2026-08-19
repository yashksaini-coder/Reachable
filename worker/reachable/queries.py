"""The six answers, one typed function each. Every traversal runs inside HydraDB.

Engine rules that shape every query here (AGENTS.md §8):
- RESOLVED is the flattened install tree, so "does this lockfile pull in X" is ONE hop, and the
  transitive arms the spec drafted are redundant. Var-length incoming from a popular version
  explodes (250k-path frontier cap / 30 s timeout on the real graph) — never do that.
- algo.* is a complete statement; filtering happens after YIELD in Python
- MSpaths pathCount defaults to 1 and resultLimit truncates silently -> both explicit
- no min/max/DISTINCT-in-aggregate -> ORDER BY LIMIT 1, dedupe via grouping keys
- no literal constants in RETURN -> levels/labels are attached in Python
- every id formatted into query text goes through _int(); the assert is the injection defence

Every Result carries the statement that was actually executed (`cypher`) so the console's
"How HydraDB answered this" card is generated from truth, never from a static string.
"""

from dataclasses import dataclass, field

from reachable.db import timed
from reachable.ids import cypher_str_list, gid


def _int(v) -> int:
    assert isinstance(v, int) and v >= 0, v
    return v


@dataclass
class Result:
    rows: list[dict]
    ms: float
    truncated: bool = False
    meta: dict = field(default_factory=dict)
    cypher: list[str] = field(default_factory=list)  # executed statements, in order
    limitations: list[str] = field(default_factory=list)


def _run(s, res: Result, q: str, **params) -> list[dict]:
    rows, ms = timed(s, q, **params)
    res.ms += ms
    res.cypher.append(q)
    return rows


def _pathkeys(path) -> list[str]:
    """HydraDB yields a path as a flat list [node_props, REL_TYPE, node_props, ...] with no labels;
    the key prefix (pkg:/lock:/svc:) is the label. Returns the alternating keys and rel types."""
    return [el if isinstance(el, str) else el["key"] for el in path]


# ---------------------------------------------------------------- Q2 · which version


def q2_affected_versions(s, advisory_key: str) -> Result:
    """Which version introduced it: earliest affected version + the full affected list."""
    res = Result([], 0.0)
    a = _int(gid(advisory_key))
    first = _run(
        s,
        res,
        f"MATCH (a:Advisory {{id: {a}}})-[:AFFECTS]->(v:Version) "
        "RETURN v.key AS version, v.published_at AS published_at "
        "ORDER BY v.published_at ASC LIMIT 1",
    )
    res.rows = _run(
        s,
        res,
        f"MATCH (a:Advisory {{id: {a}}})-[af:AFFECTS]->(v:Version)-[:VERSION_OF]->(p:Package) "
        "RETURN p.key AS package, v.key AS version, v.published_at AS published_at, "
        "v.removed AS removed, af.live_from AS live_from, af.live_to AS live_to, "
        "af.live_to_kind AS live_to_kind ORDER BY v.published_at ASC",
    )
    res.meta["first"] = first[0] if first else None
    if any(r["live_to_kind"] == "upper_bound" for r in res.rows):
        res.limitations.append(
            "live_to is an upper bound: npm publishes no takedown time; we use "
            "min(next surviving publish, advisory published)."
        )
    return res


# ---------------------------------------------------------------- Q1 · who is exposed

# SPpaths calls one Q1 answer may spend on explanations. Membership is never capped.
EXPLAIN_PATH_BUDGET = 60


def q1_exposed_services(s, bad_version_keys: list[str], *, explain: bool = True) -> Result:
    """Which services are transitively exposed, with the path that proves it.

    Membership: RESOLVED is the flattened install tree npm actually wrote, so any lockfile that
    transitively depends on a bad version has a RESOLVED edge to it — one hop, in-engine.
    Explanation: per (bad, lockfile), algo.SPpaths over DEPENDS_ON+RESOLVED yields the chain
    "which of your dependencies pulls it in" (integer node ids as parameters — no literal surface).
    """
    res = Result([], 0.0)
    hits: dict[tuple[str, str], dict] = {}
    # One anchored seek per affected version. Batching these into an OR chain removes the node
    # anchor and makes the engine scan every RESOLVED edge — measured: a 30 s timeout even for a
    # single-version advisory. AGENTS.md §8.
    for key in bad_version_keys:
        vid = _int(gid(key))
        for r in _run(
            s,
            res,
            f"MATCH (bad:Version {{id: {vid}}})<-[r:RESOLVED]-(l:Lockfile)<-[:HAS_LOCKFILE]-(sv:Service) "
            "RETURN sv.key AS service, l.key AS lockfile, l.id AS lid, l.committed_at AS committed_at, "
            "l.sha AS sha, r.at AS resolved_at ORDER BY l.committed_at DESC",
        ):
            k = (r["service"], r["lockfile"])
            hits.setdefault(k, {**r, "bad_versions": []})["bad_versions"].append(key)
    if explain and hits:
        # One SPpaths call per (bad, lockfile), pathCount 3. That product is the whole cost of Q1
        # and it explodes on a wide advisory — nanoid <3.3.18 matches 118 versions, so the pairs
        # run into the hundreds and the query stops returning. Membership is one cheap hop and
        # stays exact; only the explanation is budgeted, newest commits first. Past the budget
        # hops is None, never 0 — 0 renders as "direct dependency", which we would not have proved.
        q = (
            "CALL algo.SPpaths({sourceNode: $src, targetNode: $dst, relTypes: ['DEPENDS_ON', 'RESOLVED'], "
            "relDirection: 'incoming', maxLen: 9, pathCount: 3}) YIELD path RETURN path"
        )
        spent = 0
        explained = 0
        for h in sorted(hits.values(), key=lambda d: -(d["committed_at"] or 0)):
            h["paths"] = []
            if explained and spent + len(h["bad_versions"]) > EXPLAIN_PATH_BUDGET:
                h["hops"] = None
                h["via"] = None
                continue
            for key in h["bad_versions"]:
                spent += 1
                for row in _run(s, res, q, src=_int(gid(key)), dst=_int(h["lid"])):
                    chain = _pathkeys(row["path"])
                    h["paths"].append(
                        {"bad": key, "chain": chain, "hops": (len(chain) - 1) // 2 - 1}
                    )
            h["hops"] = min((p["hops"] for p in h["paths"]), default=0)
            h["via"] = next((p["chain"][2] for p in h["paths"] if p["hops"] > 0), None)
            explained += 1
        if explained < len(hits):
            res.limitations.append(
                f"Proof paths computed for the {explained} most recently committed of "
                f"{len(hits)} exposed lockfiles; the rest read “— not computed”. "
                "Membership is exact for all of them."
            )
    for h in hits.values():
        h.pop("lid", None)
        h.setdefault("hops", 0)  # explain=False: caller asked for membership only
        h.setdefault("paths", [])
        h.setdefault("via", None)
    res.rows = sorted(hits.values(), key=lambda d: (d["service"], -d["committed_at"]))
    res.meta["services"] = sorted({h["service"] for h in hits.values()})
    res.meta["lockfiles"] = len(hits)
    res.limitations.append(
        "Membership is exact (RESOLVED = the lockfile's flattened install tree). "
        "Explanation paths are the 3 shortest per lockfile, not all of them."
    )
    return res


def q1_blast_radius_count(
    s, bad_version_keys: list[str], service_keys: list[str], *, path_count: int = 1
) -> Result:
    """One algo.MSpaths call: N compromised versions x M services, reverse direction.
    The many-to-many demo query. Sources and targets are inline literals (engine rule), so both
    lists must already have passed the allowlist. Returns distinct (bad, service) pairs.

    maxLen 2 (bad <-RESOLVED- lockfile <-HAS_LOCKFILE- service) is exact because RESOLVED is the
    flattened tree. Anything longer lets the engine expand the TARGET frontier through every
    lockfile's thousands of RESOLVED/DEPENDS_ON edges: measured on the real graph, maxLen 2 =
    1.8 s cold / 5 ms warm, maxLen >= 3 = 30 s timeout (native_path_target_frontier).
    """
    res = Result([], 0.0)
    q = (
        "CALL algo.MSpaths({sourceLabel: 'Version', sourceProperty: 'key', "
        f"sourceValues: {cypher_str_list(bad_version_keys)}, "
        f"targetLabel: 'Service', targetProperty: 'key', targetValues: {cypher_str_list(service_keys)}, "
        "relTypes: ['RESOLVED', 'HAS_LOCKFILE'], relDirection: 'incoming', "
        "maxLen: $maxlen, pathCount: $pathcount, resultLimit: $limit}) YIELD path RETURN path"
    )
    limit = len(bad_version_keys) * len(service_keys) * path_count
    rows = _run(s, res, q, maxlen=2, pathcount=path_count, limit=limit + 1)
    res.truncated = len(rows) > limit
    pairs = {}
    for r in rows[:limit]:
        chain = _pathkeys(r["path"])
        pairs.setdefault((chain[0], chain[-1]), chain)
    res.rows = [{"bad": b, "service": sv, "chain": c} for (b, sv), c in sorted(pairs.items())]
    res.meta = {"sources": len(bad_version_keys), "targets": len(service_keys), "paths": len(rows)}
    res.limitations.append(
        "Membership only (maxLen 2 over the RESOLVED closure); the DEPENDS_ON explanation chain "
        "is in q1_exposed. Longer maxLen expands the target frontier and times out on the real graph."
    )
    if res.truncated:
        res.limitations.append("resultLimit reached — blast radius may be incomplete.")
    return res


# ---------------------------------------------------------------- Q3 · resolved while live


def q3_resolved_while_live(s, advisory_key: str) -> Result:
    """Which lockfiles resolved an affected version while it was installable.

    Two in-engine evidence classes, both one query for the whole incident, no transitive arm
    (RESOLVED is the flattened tree, so an indirect dependency has its own RESOLVED edge):
      in_window      — the lockfile was committed inside [live_from, live_to]: two relationship
                       properties compared in-engine (RESOLVED.at vs AFFECTS.live_from/live_to).
      pinned_removed — the lockfile pins a version npm has since erased. Only possible while it
                       was live, whatever the commit time; catches commits after the (upper-bound)
                       takedown and windows we cannot bound.
    """
    res = Result([], 0.0)
    a = _int(gid(advisory_key))
    head = (
        f"MATCH (a:Advisory {{id: {a}}})-[af:AFFECTS]->(v:Version)<-[r:RESOLVED]-(l:Lockfile)"
        "<-[:HAS_LOCKFILE]-(sv:Service) "
    )
    tail = (
        "RETURN sv.key AS service, l.key AS lockfile, l.sha AS sha, r.at AS resolved_at, "
        "v.key AS version, v.removed AS removed, af.live_from AS live_from, af.live_to AS live_to, "
        "af.live_to_kind AS live_to_kind ORDER BY r.at ASC"
    )
    seen: dict[tuple[str, str, str], dict] = {}
    for row in _run(s, res, head + "WHERE r.at >= af.live_from AND r.at <= af.live_to " + tail):
        seen[(row["service"], row["lockfile"], row["version"])] = {**row, "evidence": "in_window"}
    for row in _run(s, res, head + "WHERE v.removed = true " + tail):
        k = (row["service"], row["lockfile"], row["version"])
        if k in seen:
            seen[k]["evidence"] = "in_window+pinned_removed"
        else:
            seen[k] = {**row, "evidence": "pinned_removed"}
    res.rows = sorted(seen.values(), key=lambda r: (r["resolved_at"], r["service"]))
    res.meta["services"] = sorted({r["service"] for r in res.rows})
    res.meta["in_window"] = sum(1 for r in res.rows if r["evidence"].startswith("in_window"))
    res.meta["pinned_removed"] = sum(1 for r in res.rows if "pinned_removed" in r["evidence"])
    res.limitations.append(
        "in_window: the pin was committed while the artifact was installable; it does not prove "
        "an install happened. pinned_removed: the lockfile pins a version npm has erased, which "
        "is only possible while it was live — commit time is irrelevant."
    )
    return res


# ---------------------------------------------------------------- Q4 · maintainer fan-out


def q4_maintainer_fanout(s, bad_version_key: str) -> Result:
    """Which OTHER packages share a maintainer with the compromised one, and who resolves those.

    Stage 1: maintainers of the bad package and every other package they maintain.
    Stage 2: per co-maintained package, services resolving ANY of its versions (3-hop join,
    grouped by service — the count(DISTINCT) substitute). No var-length: RESOLVED is the closure.
    """
    res = Result([], 0.0)
    b = _int(gid(bad_version_key))
    stage1 = _run(
        s,
        res,
        f"MATCH (bad:Version {{id: {b}}})-[:VERSION_OF]->(p:Package)<-[:MAINTAINS]-(m:Maintainer)"
        "-[:MAINTAINS]->(other:Package) "
        "RETURN m.key AS maintainer, m.twofa AS twofa, m.account_created AS account_created, "
        "p.key AS bad_package, other.key AS package, other.id AS pid, other.downloads AS downloads",
    )
    by_pkg: dict[str, dict] = {}
    maints: dict[str, dict] = {}
    for r in stage1:
        maints.setdefault(
            r["maintainer"],
            {
                "login": r["maintainer"],
                "twofa": r["twofa"],
                "account_created": r["account_created"],
            },
        )
        if r["package"] == r["bad_package"]:
            continue
        e = by_pkg.setdefault(
            r["package"],
            {
                "package": r["package"],
                "pid": r["pid"],
                "downloads": r["downloads"],
                "maintainers": set(),
                "services": set(),
            },
        )
        e["maintainers"].add(r["maintainer"])
    # Bound stage 2: a prolific maintainer co-maintains dozens of packages, and each one is a
    # 3-hop join over the RESOLVED fan-in. Take the most-downloaded 12; say so in limitations.
    ranked = sorted(by_pkg.values(), key=lambda e: -(e["downloads"] or 0))
    for e in ranked[8:]:
        e["services"] = None  # not computed — rendered as "—", never as 0
    for e in ranked[:8]:
        for r in _run(
            s,
            res,
            f"MATCH (p:Package {{id: {_int(e['pid'])}}})<-[:VERSION_OF]-(v:Version)<-[:RESOLVED]-(l:Lockfile)"
            "<-[:HAS_LOCKFILE]-(sv:Service) RETURN sv.key AS service, count(*) AS n",
        ):
            e["services"].add(r["service"])
    if len(by_pkg) > 8:
        res.limitations.append(
            f"{len(by_pkg)} co-maintained packages; exposure computed for the 8 most downloaded."
        )
    res.rows = sorted(
        (
            {
                "package": e["package"],
                "downloads": e["downloads"],
                "maintainers": sorted(e["maintainers"]),
                "services_at_risk": sorted(e["services"]) if e["services"] is not None else None,
            }
            for e in by_pkg.values()
        ),
        key=lambda d: (
            -(len(d["services_at_risk"]) if d["services_at_risk"] is not None else -1),
            -(d["downloads"] or 0),
            d["package"],
        ),
    )
    res.meta["maintainers"] = sorted(maints.values(), key=lambda m: m["login"])
    if any(m["twofa"] is None for m in maints.values()):
        res.limitations.append(
            "twofa / account_created are not exposed by the public npm registry; shown as unknown, never guessed."
        )
    res.limitations.append(
        "'services at risk' = services resolving the co-maintained package today — the exposure IF that "
        "package is compromised next, not exposure to this incident."
    )
    return res


# ---------------------------------------------------------------- Q5 · typosquats


def q5_typosquats(s, package_key: str, *, max_distance: int = 2) -> Result:
    """Names within edit distance of the package, ranked by how suspicious they look."""
    res = Result([], 0.0)
    p = _int(gid(package_key))
    res.rows = _run(
        s,
        res,
        f"MATCH (suspect:Package)-[sim:NAME_SIMILAR_TO]->(popular:Package {{id: {p}}}) "
        "WHERE sim.distance <= $maxd "
        "MATCH (suspect)<-[:MAINTAINS]-(m:Maintainer) "
        "RETURN suspect.key AS package, suspect.downloads AS downloads, sim.distance AS distance, "
        "sim.kind AS kind, m.key AS maintainer, m.account_created AS account_created, m.twofa AS twofa "
        "ORDER BY sim.distance ASC, suspect.downloads ASC",
        maxd=max_distance,
    )
    seen: set[str] = set()
    res.rows = [
        r for r in res.rows if not (r["package"] in seen or seen.add(r["package"]))
    ]  # one row per package
    res.limitations.append(
        "The corpus is packages present in the ingested graph, so near-neighbours may be "
        "legitimate look-alikes; distance and kind are facts, 'typosquat' is a hypothesis."
    )
    return res


# ---------------------------------------------------------------- Q7 · reachability


def q7_reachability(s, advisory_key: str, service_key: str) -> Result:
    """unscanned (no File nodes for the service) · L0 present-not-imported ·
    L1 imported-symbol-unreferenced · L2 symbol referenced."""
    res = Result([], 0.0)
    a, sv = _int(gid(advisory_key)), _int(gid(service_key))
    scanned = _run(
        s,
        res,
        f"MATCH (sv:Service {{id: {sv}}})-[:CONTAINS]->(f:File) RETURN count(*) AS n",
    )[0]["n"]
    imports = _run(
        s,
        res,
        f"MATCH (a:Advisory {{id: {a}}})-[:AFFECTS]->(v:Version)-[:VERSION_OF]->(p:Package)"
        f"<-[i:IMPORTS]-(f:File)<-[:CONTAINS]-(sv:Service {{id: {sv}}}) "
        "RETURN f.path AS path, i.line AS line, p.key AS package",
    )
    symbols = _run(
        s,
        res,
        f"MATCH (a:Advisory {{id: {a}}})-[vs:VULNERABLE_SYMBOL]->(sym:Symbol)<-[u:USES_SYMBOL]-(f:File)"
        f"<-[:CONTAINS]-(sv:Service {{id: {sv}}}) "
        "RETURN f.path AS path, u.line AS line, sym.name AS symbol, vs.inferred AS inferred",
    )
    if scanned == 0:
        level = "unscanned"
        res.limitations.append("No source files ingested for this service; reachability unknown.")
    else:
        level = "L2" if symbols else "L1" if imports else "L0"
        res.limitations.append(
            "Import-level scan of first-party JS/TS at the exposed commit (regex, not a parser); "
            "symbol-level (L2) needs tree-sitter and is only present in the fixture."
        )
    res.rows = [{"level": level, "files_scanned": scanned, "imports": imports, "symbols": symbols}]
    res.meta["level"] = level
    return res
