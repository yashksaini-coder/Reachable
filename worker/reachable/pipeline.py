"""The ingest pipeline: a list of repos -> graph. Idempotent, resumable, cached.

    make ingest            (python -m reachable.pipeline --seeds demo/services.txt)
    python -m reachable.pipeline --seeds demo/services.txt --only services   # one stage
    python -m reachable.pipeline --repo owner/repo     # one repo, same steps as a console job

`--seeds` takes a plain text list (`owner/repo [criticality]` per line, `#` comments) or the
legacy JSON shape with snapshots/incidents/typosquat_corpus.

Order matters only for property completeness, not correctness — every write is
a MERGE on a deterministic id, so re-running any stage changes nothing.

  1. services   GitHub lockfile history -> Service, Lockfile, RESOLVED, DEPENDS_ON,
                Version/Package stubs (key + version only)
  2. packages   npm packument for every Package touched -> Version.published_at/removed,
                Maintainer, MAINTAINS, Package.downloads
  3. advisories OSV: the seed incidents by id, plus querybatch over every (name,version)
                in the graph -> Advisory, AFFECTS with the temporal window
  4. reach      L0/L1: scan first-party sources of every exposed (service, commit) for
                imports of the affected packages -> File, CONTAINS, IMPORTS
  5. typosquats NAME_SIMILAR_TO over every package name vs the top-N by downloads
  6. verify     coverage asserts: no Version without published_at, no AFFECTS without
                a window, counts printed

Every HTTP response is on disk after the first run (.cache/), so a cold run is
network-bound and a warm run is write-bound.
"""

import argparse
import json
import sys
import time
from collections import defaultdict
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

from reachable import load, typosquat
from reachable.db import run, session
from reachable.http import HttpError
from reachable.load import log, upsert_edges, upsert_nodes
from reachable.sources import github, npm, osv, reach


def yearly_cutoffs(years: int = 4) -> list[str]:
    """Jan 1 of the last `years` years plus today — i.e. one snapshot per year and the latest
    lockfile commit."""
    y = datetime.now(UTC).year
    return [f"{yy}-01-01" for yy in range(y - years + 1, y + 1)] + [
        datetime.now(UTC).strftime("%Y-%m-%d")
    ]


def write_service(s, r: dict) -> dict[str, int]:
    """Write one github.ingest_service() result. Returns edge counts per type."""
    upsert_nodes(s, "Service", [r["service"]])
    upsert_nodes(s, "Package", r["packages"])
    upsert_nodes(s, "Version", r["versions"])
    upsert_nodes(s, "Lockfile", r["lockfiles"])
    return {
        "VERSION_OF": upsert_edges(s, "VERSION_OF", "Version", "Package", r["version_of"]),
        "HAS_LOCKFILE": upsert_edges(s, "HAS_LOCKFILE", "Service", "Lockfile", r["has_lockfile"]),
        "RESOLVED": upsert_edges(s, "RESOLVED", "Lockfile", "Version", r["resolved"]),
        "DEPENDS_ON": upsert_edges(s, "DEPENDS_ON", "Version", "Version", r["depends_on"]),
    }


def versions_of(r: dict) -> dict[str, set[str]]:
    """{name: {versions}} from an ingest_service() result."""
    out: dict[str, set[str]] = defaultdict(set)
    for v in r["versions"]:
        name = v["key"][len("pkg:npm/") :].rsplit("@", 1)[0]
        out[name].add(v["version"])
    return out


def stage_services(s, seeds: dict) -> dict:
    """Returns {name: set(versions)} of every (package, version) any lockfile resolved."""
    cut = seeds["snapshots"]["yearly_cutoffs"]
    around = [(i["date"], seeds["snapshots"]["around_incidents_days"]) for i in seeds["incidents"]]
    touched: dict[str, set[str]] = defaultdict(set)
    for svc in seeds["services"]:
        t0 = time.perf_counter()
        # yearly cutoffs + the 24 most recent lockfile commits (+ any configured incident
        # windows): dense recent history is what lets a 95-minute window catch a snapshot.
        r = github.ingest_service(svc["slug"], svc["criticality"], cut, around, recent=24)
        write_service(s, r)
        for name, vs in versions_of(r).items():
            touched[name].update(vs)
        log(
            f"  {svc['slug']}: {len(r['lockfiles'])} lockfiles, {len(r['resolved'])} RESOLVED, "
            f"{len(r['depends_on'])} DEPENDS_ON, {len(r['versions'])} versions, "
            f"{len(r['skipped_snapshots'])} skipped  ({time.perf_counter() - t0:.1f}s)"
        )
    save_touched(touched)
    return touched


TOUCHED = Path(".cache") / "touched.json"


def save_touched(touched: dict[str, set[str]]) -> None:
    TOUCHED.parent.mkdir(exist_ok=True)
    TOUCHED.write_text(json.dumps({k: sorted(v) for k, v in touched.items()}))


def resolved_versions(s) -> dict[str, set[str]]:
    """{name: {versions}} that some lockfile actually resolved. On a resumed run, read from
    the file the services stage wrote; falling back to the graph costs ~2.4 s per lockfile
    (the engine pays per returned row on a high-degree expansion)."""
    if TOUCHED.exists():
        return defaultdict(set, {k: set(v) for k, v in json.loads(TOUCHED.read_text()).items()})
    log("  rebuilding resolved-version set from the graph (slow; ~2.4 s per lockfile)")
    out: dict[str, set[str]] = defaultdict(set)
    for lf in run(s, "MATCH (l:Lockfile) RETURN l.id AS id"):
        for r in run(
            s, f"MATCH (l:Lockfile {{id: {lf['id']}}})-[:RESOLVED]->(v:Version) RETURN v.key AS k"
        ):
            name, _, version = r["k"][len("pkg:npm/") :].rpartition("@")
            out[name].add(version)
    save_touched(out)
    return out


class LazyKnown(dict):
    """{name: [versions]} for OSV range expansion, resolved on demand from the disk-cached
    packument. `in` answers for the packages the graph holds; values are memoised."""

    def __init__(self, names: list[str]):
        super().__init__()
        self._names = set(names)

    def __bool__(self) -> bool:  # empty memo must not read as "no known versions"
        return bool(self._names)

    def __contains__(self, name) -> bool:  # type: ignore[override]
        return name in self._names or dict.__contains__(self, name)

    def __missing__(self, name: str) -> list[str]:
        doc = npm.fetch_packument(name) or {}
        vs = [v for v in doc.get("time", {}) if v not in ("created", "modified")]
        self[name] = vs
        return vs

    def keys(self):  # the enriched set: what the graph holds
        return self._names


def graph_packages(s) -> list[str]:
    return sorted(r["name"] for r in run(s, "MATCH (p:Package) RETURN p.name AS name"))


def stage_packages(
    s,
    names: list[str],
    keep: dict[str, set[str]] | None = None,
    batch: int = 250,
    step: dict | None = None,
) -> dict[str, list[str]]:
    """Enrich every Package from its packument, streaming in batches so memory stays flat
    (holding 6k packuments cost 9 GB RSS). Only versions in keep[name] — the ones some
    lockfile resolved — are written: a package's full history is ~200 versions and would be
    ~1.2M dead nodes; affected-but-unresolved versions are written by the advisory stage.
    Returns {name: [all versions]} for OSV range expansion; windows re-read the cached doc.
    `step` (a job step dict) gets live `i/n packuments` progress."""
    known: dict[str, list[str]] = {}
    total = 0
    for i in range(0, len(names), batch):
        chunk = names[i : i + batch]
        pkgs, vers, vof, maints, medges = [], [], [], [], []
        for j, name in enumerate(chunk, i + 1):
            if step is not None:
                step["detail"] = f"{j}/{len(names)} packuments"
            try:
                r = npm.ingest_package(name)
            except HttpError as e:  # one registry refusal must not fail the whole job
                log(f"  packument {name}: {e!s:.120} — skipped")
                continue
            if r is None:
                log(f"  no packument: {name}")
                continue
            known[name] = [v["version"] for v in r["versions"]]
            pkgs.append(r["package"])
            want = keep.get(name, set()) if keep is not None else None
            vrows = [v for v in r["versions"] if want is None or v["version"] in want]
            vkeys = {v["key"] for v in vrows}
            vers.extend(vrows)
            vof.extend(e for e in r["version_of"] if e["src"] in vkeys)
            maints.extend(r["maintainers"])
            medges.extend(r["maintains"])
        dl = npm.downloads([p["name"] for p in pkgs])
        for p in pkgs:
            p["downloads"] = dl.get(p["name"])  # None for scoped -> property omitted
        upsert_nodes(s, "Package", pkgs)
        upsert_nodes(s, "Version", vers)
        upsert_nodes(s, "Maintainer", _dedupe(maints))
        upsert_edges(s, "VERSION_OF", "Version", "Package", vof)
        upsert_edges(s, "MAINTAINS", "Maintainer", "Package", medges)
        total += len(pkgs)
        log(f"  packuments {min(i + batch, len(names))}/{len(names)}  (+{len(vers)} versions)")
    log(f"  {total} packages enriched")
    return known


def _dedupe(rows: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for r in rows:
        seen.setdefault(r["key"], r)
    return list(seen.values())


def _windows(pairs) -> dict:
    """(name, version) -> {published_at, next_surviving}. Packuments come from the disk cache."""
    out = {}
    by_name: dict[str, list[str]] = defaultdict(list)
    for name, version in pairs:
        by_name[name].append(version)
    for name, versions in by_name.items():
        doc = npm.fetch_packument(name)
        if doc is None:
            continue
        for version in versions:
            t = doc.get("time", {}).get(version)
            if t is None:
                continue
            out[(name, version)] = {
                "published_at": npm.epoch(t),
                "next_surviving": npm.next_surviving_publish(doc, version),
                "removed": version not in doc.get("versions", {}),
            }
    return out


def stage_advisories(
    s, seeds: dict, known: dict[str, list[str]], touched: dict[str, set[str]]
) -> None:
    ids: set[str] = {i["id"] for i in seeds["incidents"]}
    pairs = sorted((n, v) for n, vs in touched.items() for v in vs)
    # incidents may list bad versions that no seed resolved — still ingest them, so the
    # graph carries the whole incident (Q2's version list, and hand-listed packages)
    for inc in seeds["incidents"]:
        for name, versions in inc.get("packages", {}).items():
            pairs.extend((name, v) for v in versions)
    ingest_advisories(s, pairs, known, ids)


def ingest_advisories(
    s,
    pairs: list[tuple[str, str]],
    known: dict[str, list[str]],
    ids: set[str] | None = None,
    step: dict | None = None,
) -> dict[str, int]:
    """OSV querybatch over (name, version) pairs (+ any explicit advisory ids) -> Advisory,
    AFFECTS with the temporal window, stub Package/Version for affected-but-unresolved
    versions, malicious flags. Returns counts."""
    ids = set(ids or ())
    for found in osv.query_batch(sorted(set(pairs))).values():
        ids.update(found)
    log(f"  {len(ids)} advisories touch the graph")
    advisories, affects, all_pairs = [], [], set()
    all_windows: dict = {}
    for i, aid in enumerate(sorted(ids), 1):
        if step is not None:
            step["detail"] = f"{i}/{len(ids)} advisories"
        rec = osv.fetch_vuln(aid)
        if rec is None:
            log(f"  missing advisory {aid}")
            continue
        p = osv.affected_pairs(rec, known_versions=known)
        all_pairs.update(p)
        windows = _windows(p)
        all_windows.update(windows)
        r = osv.ingest_advisory(aid, windows, known_versions=known)
        advisories.append(r["advisory"])
        affects.extend(r["affects"])
    # affected versions need Version + Package nodes with real published_at/removed — they were
    # not necessarily resolved by any lockfile, so the packages stage did not write them
    stub_versions = []
    for n, v in sorted(all_pairs):
        row = {"key": f"pkg:npm/{n}@{v}", "version": v}
        w = all_windows.get((n, v))
        if w:
            row["published_at"] = w["published_at"]
            row["removed"] = w["removed"]
        stub_versions.append(row)
    stub_pkgs = _dedupe(
        [{"key": f"pkg:npm/{n}", "name": n, "ecosystem": "npm"} for n, _ in all_pairs]
    )
    upsert_nodes(s, "Package", stub_pkgs)
    upsert_nodes(s, "Version", stub_versions)
    upsert_edges(
        s,
        "VERSION_OF",
        "Version",
        "Package",
        [{"src": v["key"], "dst": v["key"].rsplit("@", 1)[0]} for v in stub_versions],
    )
    upsert_nodes(s, "Advisory", advisories)
    upsert_edges(s, "AFFECTS", "Advisory", "Version", affects)
    # affected versions discovered here still need their packument (published_at, removed)
    missing = sorted({n for n, _ in all_pairs} - set(known.keys()))
    if missing:
        log(f"  enriching {len(missing)} advisory-only packages")
        keep: dict[str, set[str]] = defaultdict(set)
        for n, v in all_pairs:
            keep[n].add(v)
        known.update(stage_packages(s, missing, keep=keep, step=step))
    # mark malicious versions
    mal = [
        {"key": a["dst"], "malicious": True}
        for a in affects
        if next((x for x in advisories if x["key"] == a["src"]), {}).get("kind") == "malware"
    ]
    if mal:
        # MERGE needs `version` too? No — MERGE on id unions properties; key is required by upsert.
        upsert_nodes(s, "Version", _dedupe(mal))
    log(f"  {len(advisories)} advisories, {len(affects)} AFFECTS, {len(mal)} malicious versions")
    return {"advisories": len(advisories), "AFFECTS": len(affects), "malicious": len(mal)}


def stage_reach(s) -> None:
    """L0/L1 reachability for every (service, lockfile) that resolves an advisory-affected
    version: scan first-party sources at that commit for imports of the affected packages."""
    # File nodes are keyed per service (not per commit), so scan each service ONCE at its
    # newest exposed lockfile commit, for every advisory-affected package it resolves there.
    # Anchored per advisory: an unanchored walk over 240k AFFECTS edges hits the 30 s timeout.
    per_svc: dict[str, dict] = {}
    for a in run(s, "MATCH (a:Advisory) RETURN a.id AS id"):
        for r in run(
            s,
            f"MATCH (a:Advisory {{id: {a['id']}}})-[:AFFECTS]->(v:Version)<-[:RESOLVED]-(l:Lockfile)"
            "<-[:HAS_LOCKFILE]-(sv:Service) MATCH (v)-[:VERSION_OF]->(p:Package) "
            "RETURN sv.key AS svc, l.sha AS sha, l.committed_at AS at, p.name AS pkg",
        ):
            e = per_svc.setdefault(r["svc"], {"sha": r["sha"], "at": r["at"], "pkgs": set()})
            if r["at"] > e["at"]:
                e["sha"], e["at"] = r["sha"], r["at"]
            e["pkgs"].add(r["pkg"])
    targets: dict[tuple[str, str], set[str]] = {
        (svc, e["sha"]): e["pkgs"] for svc, e in per_svc.items()
    }
    log(f"  {len(targets)} exposed (service, commit) pairs to scan")
    files, contains, imports = [], [], []
    for (svc, sha), pkgs in sorted(targets.items()):
        slug = svc[len("svc:") :]
        r = reach.scan_service(slug, sha, pkgs)
        files += r["files"]
        contains += r["contains"]
        imports += r["imports"]
        log(
            f"  {slug}@{sha[:12]}: {r['scanned']} files, {r['hits']} import hits for {sorted(pkgs)[:4]}"
        )
    upsert_nodes(s, "File", _dedupe(files))
    upsert_edges(s, "CONTAINS", "Service", "File", contains)
    upsert_edges(s, "IMPORTS", "File", "Package", imports)
    log(f"  {len(_dedupe(files))} files, {len(imports)} IMPORTS edges")


def stage_typosquats(s, seeds: dict) -> None:
    rows = run(s, "MATCH (p:Package) RETURN p.name AS name, p.downloads AS downloads")
    names = [r["name"] for r in rows]
    top_n = seeds["typosquat_corpus"]["top_n_by_downloads"]
    popular = {r["name"] for r in sorted(rows, key=lambda r: -(r["downloads"] or 0))[:top_n]}
    edges = typosquat.similar_names(names, popular)
    upsert_edges(s, "NAME_SIMILAR_TO", "Package", "Package", edges)
    log(f"  {len(edges)} NAME_SIMILAR_TO edges over {len(names)} names ({len(popular)} popular)")


EDGE_SHAPES = {
    "VERSION_OF": ("Version", "Package"),
    "DEPENDS_ON": ("Version", "Version"),
    "MAINTAINS": ("Maintainer", "Package"),
    "AFFECTS": ("Advisory", "Version"),
    "HAS_LOCKFILE": ("Service", "Lockfile"),
    "RESOLVED": ("Lockfile", "Version"),
    "NAME_SIMILAR_TO": ("Package", "Package"),
}


def stage_verify(s) -> None:
    for label in ("Package", "Version", "Maintainer", "Advisory", "Service", "Lockfile"):
        log(f"  {label:10} {load.count(s, label):>7}")
    # Whole-type edge scans exceed the 30 s engine timeout past ~100k edges (AGENTS.md §8), so
    # only the small relationship types are counted; the big ones are reported at write time.
    for rel, (a, b) in EDGE_SHAPES.items():
        if rel in ("DEPENDS_ON", "RESOLVED", "VERSION_OF"):
            log(f"  {rel:15}   (not counted — large; see stage logs)")
            continue
        try:
            n = run(s, f"MATCH (x:{a})-[r:{rel}]->(y:{b}) RETURN count(*) AS c")[0]["c"]
            log(f"  {rel:15} {n:>7}")
        except Exception as e:  # noqa: BLE001 — a count that times out is not a data problem
            log(f"  {rel:15}   (count timed out: {str(e).split('{message: ')[-1][:60]})")
    # coverage: a Version resolved by a lockfile with no published_at means the packument
    # stage missed it — Q3 would silently drop the row rather than complain
    total = load.count(s, "Version")
    dated = run(s, "MATCH (v:Version) WHERE v.published_at >= 0 RETURN count(*) AS c")[0]["c"]
    log(f"  Version.published_at coverage: {dated}/{total}")
    aff = run(s, "MATCH (x:Advisory)-[a:AFFECTS]->(y:Version) RETURN count(*) AS c")[0]["c"]
    win = run(
        s,
        "MATCH (x:Advisory)-[a:AFFECTS]->(y:Version) "
        "WHERE a.live_from >= 0 AND a.live_to >= 0 RETURN count(*) AS c",
    )[0]["c"]
    log(f"  AFFECTS window coverage: {win}/{aff}")
    assert win == aff, "AFFECTS edges without a window — Q3 would under-report"


STAGES = ["services", "packages", "advisories", "reach", "typosquats", "verify"]


def load_seeds(path: str) -> dict:
    """JSON (legacy shape) or a text list of `owner/repo [criticality]` lines."""
    text = Path(path).read_text()
    if text.lstrip().startswith("{"):
        return json.loads(text)
    services = []
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            slug, *rest = line.split()
            services.append({"slug": slug, "criticality": int(rest[0]) if rest else 1})
    return {
        "services": services,
        "snapshots": {"yearly_cutoffs": yearly_cutoffs(), "around_incidents_days": 0},
        "incidents": [],
        "typosquat_corpus": {"top_n_by_downloads": 2000},
    }


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="demo/services.txt")
    ap.add_argument("--repo", help="owner/repo: run the per-repo job steps and exit")
    ap.add_argument("--only", choices=STAGES, action="append")
    a = ap.parse_args(argv)
    if a.repo:
        from reachable import jobs  # circular at module level

        job = jobs.run_repo(a.repo)
        jobs.print_job(asdict(job))
        return 0 if job.status == "done" else 1
    seeds = load_seeds(a.seeds)
    only = set(a.only or STAGES)
    t0 = time.perf_counter()
    with session() as s:
        touched: dict[str, set[str]] = defaultdict(set)
        known: dict[str, list[str]] = {}
        if "services" in only:
            log("== services")
            touched = stage_services(s, seeds)
        if "packages" in only:
            log("== packages")
            if not touched:
                touched = resolved_versions(s)
            known = stage_packages(s, graph_packages(s), keep=touched)
        if "advisories" in only:
            log("== advisories")
            if not touched:
                touched = resolved_versions(s)
            if not known:  # resumed run: lazily from cached packuments (a Version scan is refused)
                known = LazyKnown(graph_packages(s))
            stage_advisories(s, seeds, known, touched)
        if "reach" in only:
            log("== reach")
            stage_reach(s)
        if "typosquats" in only:
            log("== typosquats")
            stage_typosquats(s, seeds)
        if "verify" in only:
            log("== verify")
            stage_verify(s)
    log(f"done in {time.perf_counter() - t0:.0f}s")


if __name__ == "__main__":
    sys.exit(main())
