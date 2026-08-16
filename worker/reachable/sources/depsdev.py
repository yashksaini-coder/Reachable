"""deps.dev v3 — ENRICHMENT ONLY.

RESOLVED edges come from lockfiles, never from here: deps.dev's resolution is
"what npm would install today", not what a service actually installed at a
commit. Use this for version timelines, dependents counts, and DEPENDS_ON
graphs of *published* versions (Package/Version stubs the lockfile may not
have touched).
"""

from collections import deque
from datetime import datetime
from urllib.parse import quote

from reachable.http import get_json
from reachable.ids import SEMVER, safe_name, safe_purl
from reachable.load import log

V3 = "https://api.deps.dev/v3/systems/npm/packages/"
V3A = "https://api.deps.dev/v3alpha/systems/npm/packages/"


def _ts(iso: str) -> int:
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp())


def _q(s: str) -> str:
    return quote(s, safe="")


def package_versions(name: str) -> list[dict]:
    """[{"version", "published_at": int, "deprecated": bool}] sorted by published_at. Semver-valid only."""
    data = get_json(V3 + _q(name), ok404=True)
    if data is None:
        return []
    out = []
    for v in data.get("versions", []):
        ver = v["versionKey"]["version"]
        if not SEMVER.match(ver) or not v.get("publishedAt"):
            continue
        out.append(
            {
                "version": ver,
                "published_at": _ts(v["publishedAt"]),
                "deprecated": bool(v.get("isDeprecated")),
            }
        )
    out.sort(key=lambda r: (r["published_at"], r["version"]))
    return out


def dependency_graph(name: str, version: str) -> dict | None:
    """{"nodes": [(name, version, relation)], "edges": [(from_name, from_version, to_name, to_version, requirement)]}."""
    data = get_json(f"{V3}{_q(name)}/versions/{_q(version)}:dependencies", ok404=True)
    if data is None:
        return None
    nodes = [
        (n["versionKey"]["name"], n["versionKey"]["version"], n["relation"])
        for n in data.get("nodes", [])
    ]
    edges = []
    for e in data.get("edges", []):
        a, b = nodes[e["fromNode"]], nodes[e["toNode"]]
        edges.append((a[0], a[1], b[0], b[1], e.get("requirement", "")))
    return {"nodes": nodes, "edges": edges}


def dependents_count(name: str, version: str) -> dict | None:
    """{"dependentCount", "directDependentCount", "indirectDependentCount"} as ints, or None."""
    data = get_json(f"{V3A}{_q(name)}/versions/{_q(version)}:dependents", ok404=True)
    if data is None:
        return None
    return {
        k: int(data.get(k, 0))
        for k in ("dependentCount", "directDependentCount", "indirectDependentCount")
    }


def _vkey(name: str, version: str) -> str | None:
    try:
        return safe_purl(name, version)
    except ValueError as e:
        log(f"depsdev: skip {e}")
        return None


def depends_on_edges(graph: dict) -> list[dict]:
    """DEPENDS_ON rows: {src: version key, dst: version key, range: requirement}."""
    out = []
    for fn, fv, tn, tv, req in graph["edges"]:
        s, d = _vkey(fn, fv), _vkey(tn, tv)
        if s and d:
            out.append({"src": s, "dst": d, "range": req})
    return out


def version_stubs(graph: dict) -> list[dict]:
    """Version rows: {key, version}."""
    out = []
    for n, v, _ in graph["nodes"]:
        k = _vkey(n, v)
        if k:
            out.append({"key": k, "version": v})
    return out


def package_stubs(graph: dict) -> list[dict]:
    """Package rows: {key, name, ecosystem}, deduplicated."""
    seen = {}
    for n, v, _ in graph["nodes"]:
        if _vkey(n, v):
            seen[n] = {"key": f"pkg:npm/{safe_name(n)}", "name": n, "ecosystem": "npm"}
    return list(seen.values())


def version_of_edges(graph: dict) -> list[dict]:
    """VERSION_OF rows: {src: version key, dst: package key}."""
    out = []
    for n, v, _ in graph["nodes"]:
        k = _vkey(n, v)
        if k:
            out.append({"src": k, "dst": f"pkg:npm/{n}"})
    return out


if __name__ == "__main__":
    vs = package_versions("chalk")
    by = {r["version"]: r for r in vs}
    # deps.dev DROPS unpublished versions: chalk@5.6.1 (the 2025-09-08 compromise, published
    # 1757337185) is absent here. Removed-version timelines must come from the registry `time` map.
    assert "5.6.1" not in by, "deps.dev now lists chalk@5.6.1 — revisit the removed-version note"
    assert by["5.6.0"]["published_at"] == 1755415667, by["5.6.0"]  # 2025-08-17T07:27:47Z
    assert by["5.6.2"]["published_at"] > by["5.6.0"]["published_at"]
    assert [r["published_at"] for r in vs] == sorted(r["published_at"] for r in vs)
    assert all(isinstance(r["published_at"], int) for r in vs)

    g = dependency_graph("express", "4.21.2")
    assert g and len(g["nodes"]) >= 60 and len(g["edges"]) >= 100, (
        len(g["nodes"]),
        len(g["edges"]),
    )
    selfs = [i for i, n in enumerate(g["nodes"]) if n[2] == "SELF"]
    assert len(selfs) == 1, selfs
    # BFS from SELF over the edge list; every DIRECT node must sit at depth 1.
    idx = {n[:2]: i for i, n in enumerate(g["nodes"])}
    adj: dict[int, list[int]] = {}
    for fn, fv, tn, tv, _ in g["edges"]:
        adj.setdefault(idx[(fn, fv)], []).append(idx[(tn, tv)])
    depth = {selfs[0]: 0}
    q = deque([selfs[0]])
    while q:
        u = q.popleft()
        for w in adj.get(u, []):
            if w not in depth:
                depth[w] = depth[u] + 1
                q.append(w)
    for i, n in enumerate(g["nodes"]):
        if n[2] == "DIRECT":
            assert depth.get(i) == 1, (n, depth.get(i))
    dep = depends_on_edges(g)
    assert len(dep) == len(g["edges"])
    assert all(r["src"].startswith("pkg:npm/") and "@" in r["src"][8:] for r in dep)
    vstubs, pstubs, vof = version_stubs(g), package_stubs(g), version_of_edges(g)
    assert len(vstubs) == len(g["nodes"]) == len(vof)
    assert {r["dst"] for r in vof} == {r["key"] for r in pstubs}
    assert {"key": "pkg:npm/express", "name": "express", "ecosystem": "npm"} in pstubs

    dc = dependents_count("@tanstack/router-core", "1.171.24")
    assert dc and dc["dependentCount"] > 100, dc

    print(
        f"depsdev ok: chalk versions={len(vs)} express@4.21.2 nodes={len(g['nodes'])} edges={len(g['edges'])} "
        f"direct={sum(1 for n in g['nodes'] if n[2] == 'DIRECT')} packages={len(pstubs)} "
        f"@tanstack/router-core@1.171.24 dependents={dc['dependentCount']}"
    )
