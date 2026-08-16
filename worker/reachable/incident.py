"""Compose the six answers for one advisory into one payload, with measured timings.

    make incident ID=GHSA-g7cv-rxg3-hmpx          prints the blast radius
    python -m reachable.incident <id> --out        writes worker/out/<id>.json (the web contract + fallback)
    python -m reachable.incident <id> --runs 20    repeats the hot queries for p50/p95 (measured, never estimated)

The payload IS the JSON contract with the web console. Each section carries:
  rows · ms · cypher (the statements actually executed) · limitations (honest caveats)
so the console's "How HydraDB answered this" card is generated from truth.
"""

import argparse
import json
import platform
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from neo4j.exceptions import Neo4jError

from reachable import queries
from reachable.db import URI, run, session
from reachable.ids import gid

OUT = Path(__file__).resolve().parents[1] / "out"
BENCH = Path(__file__).resolve().parents[2] / "benchmarks" / "results"


def _iso(epoch: int | None) -> str | None:
    return None if epoch is None else datetime.fromtimestamp(epoch, UTC).isoformat()


def _section(res: queries.Result, **extra) -> dict:
    return {
        "rows": res.rows,
        "ms": round(res.ms, 2),
        "truncated": res.truncated,
        "cypher": res.cypher,
        "limitations": res.limitations,
        **res.meta,
        **extra,
    }


def _pct(xs: list[float], p: float) -> float:
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(len(xs) * p))]


def provenance(s) -> dict:
    """Where the numbers came from. Never rendered as 'live' by anything reading the JSON."""
    try:
        digest = (
            subprocess.run(
                [
                    "docker",
                    "inspect",
                    "--format",
                    "{{index .RepoDigests 0}}",
                    "ghcr.io/hydra-db/hydradb:latest",
                ],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            ).stdout.strip()
            or None
        )
    except (OSError, subprocess.SubprocessError):
        digest = None
    counts = {}
    for label in ("Service", "Lockfile", "Package", "Version", "Advisory", "Maintainer"):
        try:
            counts[label] = run(s, f"MATCH (n:{label}) RETURN count(*) AS c")[0]["c"]
        except Neo4jError as e:
            # A whole-label count past 250k nodes is refused by admission control
            # (cypher_vertex_label_index_candidates … exceeds limit 250000). Report, never guess.
            counts[label] = None
            print(f"provenance: {label} count unavailable: {e.message}", file=sys.stderr)
    # No edge counts here: whole-type edge scans exceed the 30 s query timeout past ~100k edges.
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "hydradb_image": digest,
        "bolt_uri": URI,
        "platform": platform.platform(),
        "graph": counts,
        "note": "All ms are wall-clock from the Python driver over loopback Bolt; cold = first run "
        "after the node was idle, warm = subsequent runs. Both are reported; neither is estimated.",
    }


def advisory(s, key: str) -> dict | None:
    rows = run(
        s,
        f"MATCH (a:Advisory {{id: {gid(key)}}}) RETURN a.key AS key, a.kind AS kind, "
        "a.severity AS severity, a.published_at AS published_at, a.summary AS summary",
    )
    return rows[0] if rows else None


def compose(s, advisory_key: str, *, runs: int = 1) -> dict:
    t0 = time.perf_counter()
    a = advisory(s, advisory_key)
    if a is None:
        raise SystemExit(f"advisory not in graph: {advisory_key}")

    q2 = queries.q2_affected_versions(s, advisory_key)
    bad = [r["version"] for r in q2.rows]
    services_all = [r["k"] for r in run(s, "MATCH (sv:Service) RETURN sv.key AS k ORDER BY sv.key")]

    # Q1 membership + explanation. Timed per run; first run is "cold" for the report.
    q1_ms: list[float] = []
    q1 = queries.Result([], 0.0)
    for _ in range(max(1, runs)):
        q1 = queries.q1_exposed_services(s, bad) if bad else queries.Result([], 0.0)
        q1_ms.append(q1.ms)
    # The one-call many-to-many MSpaths — the demo query — timed the same way.
    ms_ms: list[float] = []
    ms_res = queries.Result([], 0.0)
    if bad and services_all:
        for _ in range(max(1, runs)):
            ms_res = queries.q1_blast_radius_count(s, bad, services_all)
            ms_ms.append(ms_res.ms)

    q3 = queries.q3_resolved_while_live(s, advisory_key) if a["kind"] == "malware" else None
    q4 = queries.q4_maintainer_fanout(s, bad[0]) if bad else queries.Result([], 0.0)
    packages = sorted({r["package"] for r in q2.rows})
    q5 = {p: queries.q5_typosquats(s, p) for p in packages}

    services = q1.meta.get("services", [])
    reach = {}
    for svc in services:
        r = queries.q7_reachability(s, advisory_key, svc)
        reach[svc] = {
            **r.rows[0],
            "ms": round(r.ms, 2),
            "cypher": r.cypher,
            "limitations": r.limitations,
        }
    levels = {
        lv: sum(1 for v in reach.values() if v["level"] == lv)
        for lv in ("L0", "L1", "L2", "unscanned")
    }

    return {
        "advisory": {**a, "published_at_iso": _iso(a["published_at"])},
        "provenance": provenance(s),
        "headline": {
            "services_exposed": len(services),
            "lockfiles_exposed": q1.meta.get("lockfiles", 0),
            "resolved_while_live": len(q3.meta["services"]) if q3 else None,
            "reachable_L2": levels["L2"],
            "imported_L1": levels["L1"],
            "present_only_L0": levels["L0"],
            "unscanned": levels["unscanned"],
        },
        "q1_exposed": _section(
            q1,
            timing={
                "runs": len(q1_ms),
                "cold_ms": round(q1_ms[0], 2),
                "warm_p50_ms": round(_pct(q1_ms[1:] or q1_ms, 0.5), 2),
                "warm_p95_ms": round(_pct(q1_ms[1:] or q1_ms, 0.95), 2),
            },
        ),
        "q1_mspaths": _section(
            ms_res,
            timing={
                "runs": len(ms_ms),
                "cold_ms": round(ms_ms[0], 2) if ms_ms else None,
                "warm_p50_ms": round(_pct(ms_ms[1:] or ms_ms, 0.5), 2) if ms_ms else None,
                "warm_p95_ms": round(_pct(ms_ms[1:] or ms_ms, 0.95), 2) if ms_ms else None,
            },
            note="One algo.MSpaths call: every compromised version × every service, relDirection incoming.",
        ),
        "q2_versions": _section(
            queries.Result(
                [
                    {
                        **r,
                        "published_at_iso": _iso(r["published_at"]),
                        "live_from_iso": _iso(r["live_from"]),
                        "live_to_iso": _iso(r["live_to"]),
                    }
                    for r in q2.rows
                ],
                q2.ms,
                q2.truncated,
                q2.meta,
                q2.cypher,
                q2.limitations,
            )
        ),
        "q3_while_live": None
        if q3 is None
        else _section(
            queries.Result(
                [
                    {
                        **r,
                        "resolved_at_iso": _iso(r["resolved_at"]),
                        "live_from_iso": _iso(r["live_from"]),
                        "live_to_iso": _iso(r["live_to"]),
                    }
                    for r in q3.rows
                ],
                q3.ms,
                q3.truncated,
                q3.meta,
                q3.cypher,
                q3.limitations,
            ),
            note="live_from is exact (npm keeps the publish timestamp after erasing the version). "
            "live_to is an upper bound where marked — npm publishes no takedown time.",
        ),
        "q4_maintainers": _section(q4),
        "q5_typosquats": {p: _section(r) for p, r in q5.items()},
        "q7_reachability": reach,
        "timing_ms": {
            "total": round((time.perf_counter() - t0) * 1000, 1),
            "q1": round(q1.ms, 2),
            "q1_mspaths": round(ms_res.ms, 2),
            "q2": round(q2.ms, 2),
            "q3": round(q3.ms, 2) if q3 else None,
            "q4": round(q4.ms, 2),
            "q5": round(sum(r.ms for r in q5.values()), 2),
        },
    }


def print_report(p: dict) -> None:
    a, h, t = p["advisory"], p["headline"], p["timing_ms"]
    print(f"\n{a['key']}  [{a['kind']}/{a['severity']}]  {a['summary'][:80]}")
    print(
        f"  published {a['published_at_iso']}   graph: "
        + ", ".join(f"{k} {v}" for k, v in p["provenance"]["graph"].items())
    )
    wl = "n/a (CVE)" if h["resolved_while_live"] is None else h["resolved_while_live"]
    print(
        f"\n  {h['services_exposed']} services exposed ({h['lockfiles_exposed']} lockfiles) · {wl} resolved while live · "
        f"L2 {h['reachable_L2']} · L1 {h['imported_L1']} · L0 {h['present_only_L0']} · unscanned {h['unscanned']}"
    )
    q1, ms = p["q1_exposed"], p["q1_mspaths"]
    print(f"\n  Q2 first affected: {p['q2_versions'].get('first')}")
    print(
        f"  Q1 exposed — membership+paths {q1['timing']['cold_ms']} ms cold / {q1['timing']['warm_p50_ms']} ms warm p50 "
        f"({q1['timing']['runs']} runs)"
    )
    if ms["timing"]["cold_ms"] is not None:
        print(
            f"     one MSpaths call, {ms['sources']} versions × {ms['targets']} services: {len(ms['rows'])} pairs, "
            f"{ms['timing']['cold_ms']} ms cold / {ms['timing']['warm_p50_ms']} ms warm p50"
            + (" TRUNCATED" if ms["truncated"] else "")
        )
    seen = set()
    for r in q1["rows"]:
        if r["service"] in seen:
            continue
        seen.add(r["service"])
        lvl = p["q7_reachability"].get(r["service"], {}).get("level", "?")
        via = f" via {r['via'].replace('pkg:npm/', '')}" if r.get("via") else " (direct dependency)"
        print(
            f"    {lvl:9} {r['service']:<28} {r['lockfile'].split('@')[-1]}  {r['hops']} hops{via}"
        )
    if p["q3_while_live"]:
        q3 = p["q3_while_live"]
        print(
            f"  Q3 resolved while live ({q3['ms']} ms): {len(q3['services'])} services — {q3['in_window']} in window, {q3['pinned_removed']} pin a removed version"
        )
        for r in q3["rows"][:10]:
            print(
                f"    {r['service']:<28} {r['sha'][:12]}  at {r['resolved_at_iso']}  window→{r['live_to_iso']} [{r['live_to_kind']}]"
            )
    q4 = p["q4_maintainers"]
    print(
        f"  Q4 maintainer fan-out ({q4['ms']} ms): {', '.join(m['login'] for m in q4['maintainers'])}"
    )
    for r in q4["rows"][:6]:
        print(f"    {r['package']:<36} {len(r['services_at_risk'])} services resolve it")
    for pkg, q5 in p["q5_typosquats"].items():
        if q5["rows"]:
            print(
                f"  Q5 near-names of {pkg} ({q5['ms']} ms): "
                + ", ".join(
                    f"{r['package'].split('/', 1)[-1]}({r['kind']})" for r in q5["rows"][:6]
                )
            )
    print(f"\n  total {t['total']:.0f} ms")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("advisory")
    ap.add_argument(
        "--out", action="store_true", help="write worker/out/<id>.json + benchmarks/results/"
    )
    ap.add_argument(
        "--runs", type=int, default=1, help="repeat the hot queries N times for cold/warm p50/p95"
    )
    a = ap.parse_args(argv)
    with session() as s:
        p = compose(s, a.advisory, runs=a.runs)
    print_report(p)
    if a.out:
        OUT.mkdir(exist_ok=True)
        path = OUT / f"{a.advisory}.json"
        path.write_text(json.dumps(p, indent=2, sort_keys=True))
        BENCH.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M")
        bench = BENCH / f"{a.advisory}-{stamp}.json"
        bench.write_text(
            json.dumps(
                {
                    "advisory": a.advisory,
                    "provenance": p["provenance"],
                    "headline": p["headline"],
                    "q1_exposed": p["q1_exposed"]["timing"],
                    "q1_mspaths": p["q1_mspaths"]["timing"],
                    "timing_ms": p["timing_ms"],
                },
                indent=2,
                sort_keys=True,
            )
        )
        print(f"\n  wrote {path}\n  wrote {bench}")


if __name__ == "__main__":
    sys.exit(main())
