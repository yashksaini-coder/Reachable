"""Compose the six answers for one advisory into one payload, with measured timings.

    make incident ID=GHSA-g7cv-rxg3-hmpx          prints the blast radius
    python -m reachable.incident GHSA-... --out    writes worker/out/<id>.json (the web fallback)

The payload IS the JSON contract with the web console (web/lib/incident.ts).
Every number in it is measured; nothing is estimated.
"""

import argparse
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from reachable import queries
from reachable.db import run, session
from reachable.ids import gid

OUT = Path(__file__).resolve().parents[1] / "out"


def _iso(epoch: int | None) -> str | None:
    return None if epoch is None else datetime.fromtimestamp(epoch, UTC).isoformat()


def advisory(s, key: str) -> dict | None:
    rows = run(
        s,
        f"MATCH (a:Advisory {{id: {gid(key)}}}) RETURN a.key AS key, a.kind AS kind, "
        "a.severity AS severity, a.published_at AS published_at, a.summary AS summary",
    )
    return rows[0] if rows else None


def compose(s, advisory_key: str, *, latency_runs: int = 1) -> dict:
    """All six answers. latency_runs > 1 repeats Q1 to report p50/p95 (still measured, never estimated)."""
    t0 = time.perf_counter()
    a = advisory(s, advisory_key)
    if a is None:
        raise SystemExit(f"advisory not in graph: {advisory_key}")

    q2 = queries.q2_affected_versions(s, advisory_key)
    bad_versions = [r["version"] for r in q2.rows]

    q1_ms: list[float] = []
    q1 = None
    for _ in range(max(1, latency_runs)):
        q1 = (
            queries.q1_exposed_services(s, bad_versions)
            if bad_versions
            else queries.Result([], 0.0)
        )
        q1_ms.append(q1.ms)
    q1_ms.sort()
    p50 = q1_ms[len(q1_ms) // 2]
    p95 = q1_ms[min(len(q1_ms) - 1, int(len(q1_ms) * 0.95))]

    # Q3 only means something for malware (the artifact was yanked); for a CVE it is
    # "resolved at all", which Q1 already answers.
    q3 = queries.q3_resolved_while_live(s, advisory_key) if a["kind"] == "malware" else None
    q4 = (
        queries.q4_maintainer_fanout(s, bad_versions[0])
        if bad_versions
        else queries.Result([], 0.0)
    )
    packages = sorted({r["package"] for r in q2.rows})
    q5 = {p: queries.q5_typosquats(s, p) for p in packages}

    exposed = q1.rows if q1 else []
    services = sorted({r["service"] for r in exposed})
    while_live = sorted({r["service"] for r in q3.rows}) if q3 else []

    reach = {}
    for svc in services:
        r = queries.q7_reachability(s, advisory_key, svc)
        reach[svc] = {"level": r.meta["level"], **r.rows[0]}
    levels = {lv: sum(1 for v in reach.values() if v["level"] == lv) for lv in ("L0", "L1", "L2")}

    total_ms = (time.perf_counter() - t0) * 1000
    return {
        "advisory": {**a, "published_at_iso": _iso(a["published_at"])},
        "generated_at": datetime.now(UTC).isoformat(),
        "headline": {
            "services_exposed": len(services),
            "resolved_while_live": len(while_live),
            "reachable_L2": levels["L2"],
            "imported_L1": levels["L1"],
            "present_only_L0": levels["L0"],
        },
        "q1_exposed": {
            "rows": exposed,
            "truncated": q1.truncated if q1 else False,
            "ms": q1.ms if q1 else 0.0,
            "p50_ms": p50,
            "p95_ms": p95,
            "runs": len(q1_ms),
        },
        "q2_versions": {
            "first": q2.meta["first"],
            "rows": [
                {
                    **r,
                    "published_at_iso": _iso(r["published_at"]),
                    "live_from_iso": _iso(r["live_from"]),
                    "live_to_iso": _iso(r["live_to"]),
                }
                for r in q2.rows
            ],
            "ms": q2.ms,
        },
        "q3_while_live": None
        if q3 is None
        else {
            "rows": [{**r, "resolved_at_iso": _iso(r["resolved_at"])} for r in q3.rows],
            "direct": q3.meta["direct"],
            "transitive": q3.meta["transitive"],
            "ms": q3.ms,
            "note": (
                "live_from is exact (npm keeps the publish timestamp after erasing the version). "
                "live_to is an upper bound where marked — npm publishes no takedown time."
            ),
        },
        "q4_maintainers": {
            "rows": q4.rows,
            "maintainers": q4.meta.get("maintainers", []),
            "ms": q4.ms,
        },
        "q5_typosquats": {p: {"rows": r.rows, "ms": r.ms} for p, r in q5.items()},
        "q7_reachability": reach,
        "timing_ms": {
            "total": total_ms,
            "q1": q1.ms if q1 else 0.0,
            "q2": q2.ms,
            "q3": q3.ms if q3 else None,
            "q4": q4.ms,
            "q5": sum(r.ms for r in q5.values()),
        },
    }


def print_report(p: dict) -> None:
    a, h, t = p["advisory"], p["headline"], p["timing_ms"]
    print(f"\n{a['key']}  [{a['kind']}/{a['severity']}]  {a['summary'][:80]}")
    print(f"  published {a['published_at_iso']}")
    print(
        f"\n  {h['services_exposed']} services exposed · {h['resolved_while_live']} resolved while live · "
        f"{h['reachable_L2']} reachable (L2) · {h['imported_L1']} imported (L1) · {h['present_only_L0']} present only (L0)"
    )
    print(f"\n  Q2 first affected: {p['q2_versions']['first']}")
    print(
        f"  Q1 exposed ({p['q1_exposed']['ms']:.1f} ms, p50 {p['q1_exposed']['p50_ms']:.1f} / p95 {p['q1_exposed']['p95_ms']:.1f} over {p['q1_exposed']['runs']} runs"
        + (", TRUNCATED" if p["q1_exposed"]["truncated"] else "")
        + "):"
    )
    for r in p["q1_exposed"]["rows"]:
        lvl = p["q7_reachability"].get(r["service"], {}).get("level", "?")
        print(
            f"    {lvl}  {r['service']:<28} {r['hops']} hops  via {' <- '.join(r['path'][:4])}{' ...' if len(r['path']) > 4 else ''}"
        )
    if p["q3_while_live"]:
        q3 = p["q3_while_live"]
        print(
            f"  Q3 resolved while live ({q3['ms']:.1f} ms): {q3['direct']} direct, {q3['transitive']} transitive"
        )
        for r in q3["rows"]:
            print(
                f"    {r['service']:<28} {r['lockfile']:<40} at {r['resolved_at_iso']}  [{r['live_to_kind']}]"
            )
    print(
        f"  Q4 maintainer fan-out ({p['q4_maintainers']['ms']:.1f} ms): "
        f"{', '.join(m['login'] for m in p['q4_maintainers']['maintainers'])}"
    )
    for r in p["q4_maintainers"]["rows"][:8]:
        print(f"    {r['package']:<32} {len(r['services_at_risk'])} services at risk")
    for pkg, q5 in p["q5_typosquats"].items():
        if q5["rows"]:
            print(
                f"  Q5 typosquats of {pkg} ({q5['ms']:.1f} ms): "
                + ", ".join(f"{r['package'][8:]}({r['kind']})" for r in q5["rows"][:6])
            )
    print(f"\n  total {t['total']:.0f} ms")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("advisory")
    ap.add_argument("--out", action="store_true", help="write worker/out/<id>.json")
    ap.add_argument("--runs", type=int, default=1, help="repeat Q1 N times for p50/p95")
    a = ap.parse_args(argv)
    with session() as s:
        p = compose(s, a.advisory, latency_runs=a.runs)
    print_report(p)
    if a.out:
        OUT.mkdir(exist_ok=True)
        path = OUT / f"{a.advisory}.json"
        path.write_text(json.dumps(p, indent=2, sort_keys=True))
        print(f"\n  wrote {path}")


if __name__ == "__main__":
    sys.exit(main())
