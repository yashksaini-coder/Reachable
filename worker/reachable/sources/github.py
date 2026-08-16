"""GitHub source: lockfile commit history per service + lockfile parsers.

Supported lockfiles: npm `package-lock.json` (lockfileVersion 2 or 3) and pnpm
`pnpm-lock.yaml` (6.x and 9.x). yarn.lock / bun are detected and refused with a clear
message. Produces Service / Lockfile nodes, HAS_LOCKFILE / RESOLVED / DEPENDS_ON /
VERSION_OF edges and Package / Version stubs (docs/schema.md). Nothing here writes to
the graph.
"""

import json
import os
from datetime import UTC, datetime, timedelta

import yaml

from reachable.http import HttpError, get_json, request
from reachable.ids import SEMVER, safe_name
from reachable.load import log

LOCKFILES = ("package-lock.json", "pnpm-lock.yaml")  # tried in this order; first with commits wins
UNSUPPORTED = ("yarn.lock", "bun.lockb", "bun.lock")

API = "https://api.github.com"
_TOKEN = os.environ.get("GITHUB_TOKEN")
_H = {"Authorization": f"Bearer {_TOKEN}"} if _TOKEN else {}
_RAW = {**_H, "Accept": "application/vnd.github.raw"}


def _ts(iso: str) -> int:
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp())


def _day(d: str, offset_days: int = 0, *, end: bool = False) -> str:
    """'2025-09-08' + offset -> ISO-Z timestamp at 00:00:00 (or 23:59:59 if end)."""
    dt = datetime.fromisoformat(d).replace(tzinfo=UTC) + timedelta(days=offset_days)
    if end:
        dt += timedelta(days=1, seconds=-1)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- GitHub API


def lockfile_commits(
    slug: str,
    path: str = "package-lock.json",
    *,
    until: str | None = None,
    since: str | None = None,
    per_page: int = 1,
    page: int = 1,
    fresh: bool = False,
) -> list[dict]:
    """`fresh` stamps the URL with today's date so an unbounded "most recent" listing is
    re-fetched daily instead of served from the forever-cache."""
    url = f"{API}/repos/{slug}/commits?path={path}&per_page={per_page}&page={page}"
    if until:
        url += f"&until={until}"
    if since:
        url += f"&since={since}"
    if fresh:
        url += f"&_d={datetime.now(UTC).date().isoformat()}"
    return [
        {"sha": c["sha"], "committed_at": _ts(c["commit"]["committer"]["date"])}
        for c in get_json(url, headers=_H)
    ]


def snapshot_shas(
    slug: str,
    cutoffs: list[str],
    around: list[tuple[str, int]] = (),
    recent: int = 0,
    path: str = "package-lock.json",
) -> list[dict]:
    """Last lockfile commit at/before each cutoff + every commit within +-days of each incident
    date + the `recent` most recent commits (dense recent history is what makes narrow
    incident windows answerable without knowing the incident in advance)."""
    seen: dict[str, int] = {}
    for c in cutoffs:
        for row in lockfile_commits(slug, path, until=_day(c, end=True)):
            seen[row["sha"]] = row["committed_at"]
    if recent:
        for row in lockfile_commits(slug, path, per_page=min(recent, 100), fresh=True):
            seen[row["sha"]] = row["committed_at"]
    for date, days in around:
        since, until = _day(date, -days), _day(date, days, end=True)
        # ponytail: cap 100 per window (one page); the busiest seed repo has ~1500 commits over 9 years
        for row in lockfile_commits(slug, path, since=since, until=until, per_page=100):
            seen[row["sha"]] = row["committed_at"]
    return sorted(
        ({"sha": s, "committed_at": t} for s, t in seen.items()), key=lambda r: r["committed_at"]
    )


def _text(url: str, headers=None) -> str | None:
    r = request("GET", url, headers=headers)
    if r["status"] == 404:
        return None
    if r["status"] >= 400:
        raise HttpError(r["status"], url, r["body"])
    return r["body"]


def fetch_lockfile(slug: str, sha: str, path: str = "package-lock.json") -> str | None:
    """Raw lockfile text at a ref (None when absent). Contents API first (token, private
    repos); raw.githubusercontent.com when that answers 404/403 (e.g. files over 1 MB)."""
    try:
        text = _text(f"{API}/repos/{slug}/contents/{path}?ref={sha}", headers=_RAW)
    except HttpError as e:
        if e.status != 403:
            raise
        text = None
    # a JSON metadata envelope (not raw content) means the raw media type was not honoured
    if text is None or (text.lstrip().startswith("{") and '"download_url"' in text[:4000]):
        text = _text(f"https://raw.githubusercontent.com/{slug}/{sha}/{path}")
    return text


def root_lockfiles(slug: str) -> list[str]:
    """Lockfile-looking names in the repo root (default branch), one listing. Used only for
    the error message when no supported lockfile has any commit."""
    try:
        listing = get_json(f"{API}/repos/{slug}/contents/", headers=_H, ok404=True) or []
    except HttpError:
        return []
    names = {e.get("name") for e in listing if isinstance(e, dict)}
    return [n for n in (*LOCKFILES, *UNSUPPORTED) if n in names]


def discover_lockfile(slug: str) -> str | None:
    """First supported lockfile path with at least one commit, else None."""
    for path in LOCKFILES:
        if lockfile_commits(slug, path):
            return path
    return None


# ---------------------------------------------------------------- parser


def _name_of(path: str) -> str:
    return path.rsplit("node_modules/", 1)[1]


def parse_any(text: str, path: str) -> dict | None:
    """Dispatch on the lockfile path. Same return contract for every format."""
    if path == "pnpm-lock.yaml":
        return parse_pnpm_lock(text)
    try:
        doc = json.loads(text)
    except ValueError:
        log(f"warn: {path}: not JSON, skipping snapshot")
        return None
    return parse_lockfile(doc) if isinstance(doc, dict) else None


def parse_lockfile(doc: dict) -> dict | None:
    """npm package-lock.json, lockfileVersion 2 or 3 (both carry the `packages` map)."""
    if doc.get("lockfileVersion") not in (2, 3):
        log(
            f"warn: lockfileVersion {doc.get('lockfileVersion')!r} not in (2, 3), skipping snapshot"
        )
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


def _pnpm_ref(ref: str) -> tuple[str, str] | None:
    """'/name@1.2.3(peer@2)' | 'name@1.2.3(peer@2)' | '@s/n@1.2.3' -> (name, version)."""
    ref = ref.lstrip("/").split("(", 1)[0]
    name, sep, ver = ref.rpartition("@")
    if not sep or not name:  # 'link:..', 'github.com/…', bare '@'
        return None
    return name, ver


def parse_pnpm_lock(text: str) -> dict | None:
    """pnpm-lock.yaml v6 (`packages:` keyed `/name@ver`, deps inline) or v9 (`packages:` +
    `snapshots:` keyed `name@ver(peers)`). Ranges are not recorded per edge in pnpm
    lockfiles, so DEPENDS_ON edges carry no `range`."""
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError as e:
        log(f"warn: pnpm-lock.yaml unreadable ({str(e)[:80]}), skipping snapshot")
        return None
    if not isinstance(doc, dict):
        return None
    lv = str(doc.get("lockfileVersion", ""))
    major = lv.split(".", 1)[0]
    if major not in ("6", "9"):
        log(f"warn: pnpm lockfileVersion {lv!r} not 6.x/9.x, skipping snapshot")
        return None
    entries = doc.get("snapshots") if major == "9" else doc.get("packages")
    entries = entries or {}
    installed: dict[str, tuple[str, str]] = {}  # entry key -> (name, version)
    for key in entries:
        nv = _pnpm_ref(str(key))
        if nv is None:
            continue
        raw_name, ver = nv
        try:
            name = safe_name(raw_name)
        except ValueError:
            log(f"warn: skip name {raw_name!r}")
            continue
        if not SEMVER.match(ver):
            log(f"warn: skip version {raw_name}@{ver!r}")
            continue
        installed[str(key)] = (name, ver)
    # dep value -> installed entry: '1.2.3(peer@2)' means '<dep>@1.2.3(peer@2)'; a value that
    # starts with '/' or holds its own name is an alias to another package
    edges, unresolved = [], 0
    for key, (name, ver) in installed.items():
        e = entries[key] or {}
        for field in ("dependencies", "optionalDependencies"):
            for dep, spec in (e.get(field) or {}).items():
                spec = str(spec)
                if spec.startswith("/") or "@" in spec.split("(", 1)[0][1:]:
                    cand = spec.lstrip("/") if major == "9" else "/" + spec.lstrip("/")
                else:
                    cand = f"{dep}@{spec}" if major == "9" else f"/{dep}@{spec}"
                hit = installed.get(cand)
                if hit:
                    edges.append((name, ver, hit[0], hit[1], None))
                else:
                    unresolved += 1
    root = (doc.get("importers") or {}).get(".") or doc  # workspaces list importers, v6 flat
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


def lockfile_row(slug: str, snap: dict, path: str = "package-lock.json") -> dict:
    return {
        "key": _lkey(slug, snap),
        "committed_at": snap["committed_at"],
        "sha": snap["sha"],
        "path": path,
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
    slug: str,
    criticality: int,
    cutoffs: list[str],
    around: list[tuple[str, int]],
    recent: int = 0,
    path: str | None = None,
) -> dict:
    """`path` None = discover (package-lock.json, then pnpm-lock.yaml). The chosen path is
    returned as `lockfile_path` (None when the repo has no supported lockfile commits)."""
    if path is None:
        path = discover_lockfile(slug)
    out = {
        "service": service_row(slug, criticality),
        "lockfile_path": path,
        "lockfiles": [],
        "has_lockfile": [],
        "resolved": [],
        "depends_on": [],
        "versions": [],
        "packages": [],
        "version_of": [],
        "skipped_snapshots": [],
    }
    if path is None:
        return out
    for snap in snapshot_shas(slug, cutoffs, around, recent=recent, path=path):
        text = fetch_lockfile(slug, snap["sha"], path)
        if text is None:
            log(f"warn: {slug}@{snap['sha'][:12]}: no {path} at ref")
        parsed = parse_any(text, path) if text else None
        if parsed is None:
            out["skipped_snapshots"].append(snap["sha"])
            continue
        out["lockfiles"].append(lockfile_row(slug, snap, path))
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
        text = fetch_lockfile(slug, snap["sha"])
        assert text, slug
        p = parse_any(text, "package-lock.json")
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
    assert lodash and parse_any(lodash, "package-lock.json") is None, "lodash lockfile is v1"
    print("github ok")
