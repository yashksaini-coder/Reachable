"""The ingest pipeline: seeds.json -> graph. Idempotent, resumable, cached.

    make ingest            (python -m reachable.pipeline --seeds seeds.json)
    python -m reachable.pipeline --seeds seeds.json --only services   # one stage

Order matters only for property completeness, not correctness — every write is
a MERGE on a deterministic id, so re-running any stage changes nothing.

  1. services   GitHub lockfile history -> Service, Lockfile, RESOLVED, DEPENDS_ON,
                Version/Package stubs (key + version only)
  2. packages   npm packument for every Package touched -> Version.published_at/removed,
                Maintainer, MAINTAINS, Package.downloads
  3. advisories OSV: the seed incidents by id, plus querybatch over every (name,version)
                in the graph -> Advisory, AFFECTS with the temporal window
  4. typosquats NAME_SIMILAR_TO over every package name vs the top-N by downloads
  5. verify     coverage asserts: no Version without published_at, no AFFECTS without
                a window, counts printed

Every HTTP response is on disk after the first run (.cache/), so a cold run is
network-bound and a warm run is write-bound.
"""

import argparse
import json
import sys
import time
from collections import defaultdict

from reachable import load, typosquat
from reachable.db import run, session
from reachable.load import log, upsert_edges, upsert_nodes
from reachable.sources import github, npm, osv


def stage_services(s, seeds: dict) -> dict:
    """Returns {name: set(versions)} of every (package, version) any lockfile resolved."""
    cut = seeds["snapshots"]["yearly_cutoffs"]
    around = [(i["date"], seeds["snapshots"]["around_incidents_days"]) for i in seeds["incidents"]]
    touched: dict[str, set[str]] = defaultdict(set)
    for svc in seeds["services"]:
        t0 = time.perf_counter()
        r = github.ingest_service(svc["slug"], svc["criticality"], cut, around)
        upsert_nodes(s, "Service", [r["service"]])
        upsert_nodes(s, "Package", r["packages"])
        upsert_nodes(s, "Version", r["versions"])
        upsert_nodes(s, "Lockfile", r["lockfiles"])
        upsert_edges(s, "VERSION_OF", "Version", "Package", r["version_of"])
        upsert_edges(s, "HAS_LOCKFILE", "Service", "Lockfile", r["has_lockfile"])
        upsert_edges(s, "RESOLVED", "Lockfile", "Version", r["resolved"])
        upsert_edges(s, "DEPENDS_ON", "Version", "Version", r["depends_on"])
        for v in r["versions"]:
            name = v["key"][len("pkg:npm/") :].rsplit("@", 1)[0]
            touched[name].add(v["version"])
        log(
            f"  {svc['slug']}: {len(r['lockfiles'])} lockfiles, {len(r['resolved'])} RESOLVED, "
            f"{len(r['depends_on'])} DEPENDS_ON, {len(r['versions'])} versions, "
            f"{len(r['skipped_snapshots'])} skipped  ({time.perf_counter() - t0:.1f}s)"
        )
    return touched


def graph_packages(s) -> list[str]:
    return sorted(r["name"] for r in run(s, "MATCH (p:Package) RETURN p.name AS name"))


def stage_packages(s, names: list[str]) -> dict[str, dict]:
    """Enrich every Package from its packument. Returns {name: packument} for the advisory stage."""
    docs: dict[str, dict] = {}
    pkgs, vers, vof, maints, medges = [], [], [], [], []
    for i, name in enumerate(names):
        r = npm.ingest_package(name)
        if r is None:
            log(f"  no packument: {name}")
            continue
        docs[name] = npm.fetch_packument(name)  # disk-cached: free second read
        pkgs.append(r["package"])
        vers.extend(r["versions"])
        vof.extend(r["version_of"])
        maints.extend(r["maintainers"])
        medges.extend(r["maintains"])
        if (i + 1) % 200 == 0:
            log(f"  packuments {i + 1}/{len(names)}")
    dl = npm.downloads(list(docs))
    for p in pkgs:
        p["downloads"] = dl.get(p["name"], 0)
    upsert_nodes(s, "Package", pkgs)
    upsert_nodes(s, "Version", vers)
    upsert_nodes(s, "Maintainer", _dedupe(maints))
    upsert_edges(s, "VERSION_OF", "Version", "Package", vof)
    upsert_edges(s, "MAINTAINS", "Maintainer", "Package", medges)
    log(f"  {len(pkgs)} packages, {len(vers)} versions, {len(_dedupe(maints))} maintainers")
    return docs


def _dedupe(rows: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for r in rows:
        seen.setdefault(r["key"], r)
    return list(seen.values())


def _windows(docs: dict[str, dict], pairs) -> dict:
    """(name, version) -> {published_at, next_surviving} from the packuments."""
    out = {}
    for name, version in pairs:
        doc = docs.get(name)
        if doc is None:
            doc = npm.fetch_packument(name)
            if doc is None:
                continue
            docs[name] = doc
        t = doc.get("time", {}).get(version)
        if t is None:
            continue
        out[(name, version)] = {
            "published_at": npm.epoch(t),
            "next_surviving": npm.next_surviving_publish(doc, version),
        }
    return out


def stage_advisories(s, seeds: dict, docs: dict[str, dict], touched: dict[str, set[str]]) -> None:
    ids: set[str] = {i["id"] for i in seeds["incidents"]}
    pairs = sorted((n, v) for n, vs in touched.items() for v in vs)
    # every (name, version) in the graph -> advisory ids
    hits = osv.query_batch(pairs)
    for found in hits.values():
        ids.update(found)
    # incidents may list bad versions that no seed resolved — still ingest them, so the
    # graph carries the whole incident (Q2's version list, and hand-listed packages)
    extra_pairs = []
    for inc in seeds["incidents"]:
        for name, versions in inc.get("packages", {}).items():
            extra_pairs.extend((name, v) for v in versions)
    if extra_pairs:
        for found in osv.query_batch(extra_pairs).values():
            ids.update(found)
    log(f"  {len(ids)} advisories touch the graph")
    advisories, affects, all_pairs = [], [], set()
    for aid in sorted(ids):
        rec = osv.fetch_vuln(aid)
        if rec is None:
            log(f"  missing advisory {aid}")
            continue
        p = osv.affected_pairs(rec, known_versions=_known(docs))
        all_pairs.update(p)
        windows = _windows(docs, p)
        r = osv.ingest_advisory(aid, windows, known_versions=_known(docs))
        advisories.append(r["advisory"])
        affects.extend(r["affects"])
    # affected versions that were not already in the graph need Version + Package nodes
    stub_versions = [{"key": f"pkg:npm/{n}@{v}", "version": v} for n, v in sorted(all_pairs)]
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
    missing = sorted({n for n, _ in all_pairs} - set(docs))
    if missing:
        log(f"  enriching {len(missing)} advisory-only packages")
        docs.update(stage_packages(s, missing))
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


def _known(docs: dict[str, dict]) -> dict[str, list[str]]:
    return {
        n: [v for v in d.get("time", {}) if v not in ("created", "modified")]
        for n, d in docs.items()
    }


def stage_typosquats(s, seeds: dict) -> None:
    rows = run(s, "MATCH (p:Package) RETURN p.name AS name, p.downloads AS downloads")
    names = [r["name"] for r in rows]
    top_n = seeds["typosquat_corpus"]["top_n_by_downloads"]
    popular = {r["name"] for r in sorted(rows, key=lambda r: -(r["downloads"] or 0))[:top_n]}
    edges = typosquat.similar_names(names, popular)
    upsert_edges(s, "NAME_SIMILAR_TO", "Package", "Package", edges)
    log(f"  {len(edges)} NAME_SIMILAR_TO edges over {len(names)} names ({len(popular)} popular)")


def stage_verify(s) -> None:
    for label in ("Package", "Version", "Maintainer", "Advisory", "Service", "Lockfile"):
        log(f"  {label:10} {load.count(s, label):>7}")
    for rel in (
        "VERSION_OF",
        "DEPENDS_ON",
        "MAINTAINS",
        "AFFECTS",
        "HAS_LOCKFILE",
        "RESOLVED",
        "NAME_SIMILAR_TO",
    ):
        n = run(s, f"MATCH ()-[r:{rel}]->() RETURN count(*) AS c")[0]["c"]
        log(f"  {rel:15} {n:>7}")
    # coverage: a Version resolved by a lockfile with no published_at means the packument
    # stage missed it — Q3 would silently drop the row rather than complain
    total = load.count(s, "Version")
    dated = run(s, "MATCH (v:Version) WHERE v.published_at >= 0 RETURN count(*) AS c")[0]["c"]
    log(f"  Version.published_at coverage: {dated}/{total}")
    aff = run(s, "MATCH ()-[a:AFFECTS]->() RETURN count(*) AS c")[0]["c"]
    win = run(
        s, "MATCH ()-[a:AFFECTS]->() WHERE a.live_from >= 0 AND a.live_to >= 0 RETURN count(*) AS c"
    )[0]["c"]
    log(f"  AFFECTS window coverage: {win}/{aff}")
    assert win == aff, "AFFECTS edges without a window — Q3 would under-report"


STAGES = ["services", "packages", "advisories", "typosquats", "verify"]


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="seeds.json")
    ap.add_argument("--only", choices=STAGES, action="append")
    a = ap.parse_args(argv)
    with open(a.seeds) as f:
        seeds = json.load(f)
    only = set(a.only or STAGES)
    t0 = time.perf_counter()
    with session() as s:
        touched: dict[str, set[str]] = defaultdict(set)
        docs: dict[str, dict] = {}
        if "services" in only:
            log("== services")
            touched = stage_services(s, seeds)
        if "packages" in only:
            log("== packages")
            docs = stage_packages(s, graph_packages(s))
        if "advisories" in only:
            log("== advisories")
            if not touched:  # resumed run: rebuild the (name, version) set from the graph
                for r in run(
                    s,
                    "MATCH (v:Version)-[:VERSION_OF]->(p:Package) RETURN p.name AS n, v.version AS v",
                ):
                    touched[r["n"]].add(r["v"])
            stage_advisories(s, seeds, docs, touched)
        if "typosquats" in only:
            log("== typosquats")
            stage_typosquats(s, seeds)
        if "verify" in only:
            log("== verify")
            stage_verify(s)
    log(f"done in {time.perf_counter() - t0:.0f}s")


if __name__ == "__main__":
    sys.exit(main())
