"""GitHub source: lockfile commit history per service + package-lock.json v3 parser.

Produces Service / Lockfile nodes, HAS_LOCKFILE / RESOLVED / DEPENDS_ON / VERSION_OF
edges and Package / Version stubs (docs/schema.md). Nothing here writes to the graph.
"""

import os
from datetime import UTC, datetime, timedelta

from reachable.http import get_json
from reachable.ids import SEMVER, safe_name
from reachable.load import log

API = "https://api.github.com"
_TOKEN = os.environ.get("GITHUB_TOKEN")
_H = {"Authorization": f"Bearer {_TOKEN}"} if _TOKEN else {}
_RAW = {**_H, "Accept": "application/vnd.github.raw"}


def _ts(iso: str) -> int:
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp())


def _day(d: str, offset_days: int = 0) -> str:
    """'2025-09-08' + offset -> ISO-Z timestamp at day boundary."""
    dt = datetime.fromisoformat(d).replace(tzinfo=UTC) + timedelta(days=offset_days)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- GitHub API


def lockfile_commits(
    slug: str,
    *,
    until: str | None = None,
    since: str | None = None,
    per_page: int = 1,
    page: int = 1,
) -> list[dict]:
    url = f"{API}/repos/{slug}/commits?path=package-lock.json&per_page={per_page}&page={page}"
    if until:
        url += f"&until={until}"
    if since:
        url += f"&since={since}"
    return [
        {"sha": c["sha"], "committed_at": _ts(c["commit"]["committer"]["date"])}
        for c in get_json(url, headers=_H)
    ]


def snapshot_shas(slug: str, cutoffs: list[str], around: list[tuple[str, int]] = ()) -> list[dict]:
    """Last lockfile commit at/before each cutoff + every commit within +-days of each incident date."""
    seen: dict[str, int] = {}
    for c in cutoffs:
        for row in lockfile_commits(slug, until=_day(c, 1)):
            seen[row["sha"]] = row["committed_at"]
    for date, days in around:
        since, until = _day(date, -days), _day(date, days + 1)
        # ponytail: cap 100 per window (one page); the busiest seed repo has ~1500 commits over 9 years
        for row in lockfile_commits(slug, since=since, until=until, per_page=100):
            seen[row["sha"]] = row["committed_at"]
    return sorted(
        ({"sha": s, "committed_at": t} for s, t in seen.items()), key=lambda r: r["committed_at"]
    )


def fetch_lockfile(slug: str, sha: str) -> dict | None:
    doc = get_json(
        f"{API}/repos/{slug}/contents/package-lock.json?ref={sha}", headers=_RAW, ok404=True
    )
    if doc is None or "lockfileVersion" not in doc:
        doc = get_json(
            f"https://raw.githubusercontent.com/{slug}/{sha}/package-lock.json", ok404=True
        )
    return doc


# ---------------------------------------------------------------- parser


def _name_of(path: str) -> str:
    return path.rsplit("node_modules/", 1)[1]


def parse_lockfile(doc: dict) -> dict | None:
    if doc.get("lockfileVersion") != 3:
        log(f"warn: lockfileVersion {doc.get('lockfileVersion')!r} != 3, skipping snapshot")
        return None
    pkgs = doc.get("packages", {})
    installed: dict[str, tuple[str, str]] = {}  # path -> (name, version)
    for path, e in pkgs.items():
        if not path or "node_modules/" not in path or e.get("link"):
            continue
        raw_name, ver = _name_of(path), e.get("version")
        try:
            name = safe_name(raw_name)
        except ValueError:
            log(f"warn: skip name {raw_name!r}")
            continue
        if not ver or not SEMVER.match(ver):
            log(f"warn: skip version {raw_name}@{ver!r}")
            continue
        installed[path] = (name, ver)

    edges, unresolved = [], 0
    for path, (name, ver) in installed.items():
        e = pkgs[path]
        for field in ("dependencies", "optionalDependencies", "peerDependencies"):
            for dep, rng in (e.get(field) or {}).items():
                # npm resolution: P/node_modules/d, parent/node_modules/d, ..., node_modules/d
                cur, hit = path, None
                while True:
                    cand = f"{cur}/node_modules/{dep}" if cur else f"node_modules/{dep}"
                    if cand in installed:
                        hit = installed[cand]
                        break
                    if not cur:
                        break
                    cur = cur.rsplit("/node_modules/", 1)[0] if "/node_modules/" in cur else ""
                if hit:
                    edges.append((name, ver, hit[0], hit[1], rng))
                else:
                    unresolved += 1
    root = pkgs.get("", {})
    root_deps = set(root.get("dependencies") or {}) | set(root.get("devDependencies") or {})
    return {
        "packages": sorted(set(installed.values())),
        "edges": edges,
        "root_deps": root_deps,
        "unresolved": unresolved,
    }


# ---------------------------------------------------------------- rows


def _vkey(name: str, ver: str) -> str:
    return f"pkg:npm/{name}@{ver}"


def _lkey(slug: str, snap: dict) -> str:
    return f"lock:{slug}@{snap['sha'][:12]}"


def service_row(slug: str, criticality: int) -> dict:
    return {
        "key": f"svc:{slug}",
        "name": slug.split("/", 1)[1],
        "repo_url": f"https://github.com/{slug}",
        "criticality": criticality,
    }


def lockfile_row(slug: str, snap: dict) -> dict:
    return {
        "key": _lkey(slug, snap),
        "committed_at": snap["committed_at"],
        "sha": snap["sha"],
        "path": "package-lock.json",
    }


def has_lockfile_edge(slug: str, snap: dict) -> dict:
    return {"src": f"svc:{slug}", "dst": _lkey(slug, snap)}


def resolved_edges(slug: str, snap: dict, parsed: dict) -> list[dict]:
    return [
        {"src": _lkey(slug, snap), "dst": _vkey(n, v), "at": snap["committed_at"]}
        for n, v in parsed["packages"]
    ]


def depends_on_edges(parsed: dict) -> list[dict]:
    out: dict[tuple[str, str], dict] = {}
    for n, v, dn, dv, rng in parsed["edges"]:
        out.setdefault(
            (_vkey(n, v), _vkey(dn, dv)), {"src": _vkey(n, v), "dst": _vkey(dn, dv), "range": rng}
        )
    return list(out.values())


def version_stubs(parsed: dict) -> list[dict]:
    return [{"key": _vkey(n, v), "version": v} for n, v in parsed["packages"]]


def package_stubs(parsed: dict) -> list[dict]:
    return [
        {"key": f"pkg:npm/{n}", "name": n, "ecosystem": "npm"}
        for n in sorted({n for n, _ in parsed["packages"]})
    ]


def version_of_edges(parsed: dict) -> list[dict]:
    return [{"src": _vkey(n, v), "dst": f"pkg:npm/{n}"} for n, v in parsed["packages"]]


def _dedupe(rows: list[dict], *keys: str) -> list[dict]:
    seen, out = set(), []
    for r in rows:
        k = tuple(r[x] for x in keys)
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def ingest_service(
    slug: str, criticality: int, cutoffs: list[str], around: list[tuple[str, int]]
) -> dict:
    out = {
        "service": service_row(slug, criticality),
        "lockfiles": [],
        "has_lockfile": [],
        "resolved": [],
        "depends_on": [],
        "versions": [],
        "packages": [],
        "version_of": [],
        "skipped_snapshots": [],
    }
    for snap in snapshot_shas(slug, cutoffs, around):
        doc = fetch_lockfile(slug, snap["sha"])
        parsed = parse_lockfile(doc) if doc else None
        if parsed is None:
            out["skipped_snapshots"].append(snap["sha"])
            continue
        out["lockfiles"].append(lockfile_row(slug, snap))
        out["has_lockfile"].append(has_lockfile_edge(slug, snap))
        out["resolved"] += resolved_edges(slug, snap, parsed)
        out["depends_on"] += depends_on_edges(parsed)
        out["versions"] += version_stubs(parsed)
        out["packages"] += package_stubs(parsed)
        out["version_of"] += version_of_edges(parsed)
    for k in ("depends_on", "resolved", "version_of", "has_lockfile"):
        out[k] = _dedupe(out[k], "src", "dst")
    for k in ("versions", "packages", "lockfiles"):
        out[k] = _dedupe(out[k], "key")
    return out


# ---------------------------------------------------------------- self-check

if __name__ == "__main__":

    def stats(slug: str, snap: dict) -> None:
        doc = fetch_lockfile(slug, snap["sha"])
        assert doc and doc["lockfileVersion"] == 3, slug
        p = parse_lockfile(doc)
        assert p and len(p["packages"]) >= 500, len(p["packages"])
        assert all(SEMVER.match(v) for _, v in p["packages"])
        assert len(p["edges"]) > len(p["packages"])
        declared = len(p["edges"]) + p["unresolved"]
        pct = 100 * len(p["edges"]) / declared
        assert pct > 90, pct
        print(
            f"{slug}@{snap['sha'][:12]}: {len(p['packages'])} pkgs, {len(p['edges'])} edges, "
            f"resolved {pct:.2f}% of {declared} declared deps, {len(depends_on_edges(p))} DEPENDS_ON, "
            f"{len(resolved_edges(slug, snap, p))} RESOLVED"
        )

    snaps = snapshot_shas("socketio/socket.io", ["2025-01-01", "2026-01-01"], [("2025-09-08", 14)])
    assert len({s["sha"] for s in snaps}) >= 2, snaps
    assert all(isinstance(s["committed_at"], int) for s in snaps)
    print(f"socketio/socket.io: {len(snaps)} snapshot shas")
    stats("socketio/socket.io", snaps[-1])
    stats("Kong/insomnia", lockfile_commits("Kong/insomnia")[0])
    lodash = fetch_lockfile("lodash/lodash", lockfile_commits("lodash/lodash")[0]["sha"])
    assert lodash and parse_lockfile(lodash) is None, "lodash lockfile should be rejected (v1)"
    print("github ok")
