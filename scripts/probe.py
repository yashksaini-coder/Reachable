"""Probe HydraDB's actual OpenCypher subset against a running node.

Each case runs a real query and reports PASS/FAIL with the engine's own message.
Never infer support from Neo4j docs — different engine. Add a case here whenever
you are about to assume something.

    make probe
"""

import itertools
import time

from reachable.db import DATABASE, driver

CASES = []


def case(name, expect="accept"):
    """expect='accept' — we need this to work. expect='reject' — we expect a refusal
    and want the engine's exact wording on record."""

    def wrap(fn):
        CASES.append((name, fn, expect))
        return fn

    return wrap


# --- fixture -------------------------------------------------------------
# 201 -> 101 -> 102 -> ... -> 108   (8 hops end to end)
# 202 -> 102
# Ids must be integers; `name` carries the human key MSpaths looks up.

CHAIN = list(range(101, 109))
SERVICES = [(201, 101), (202, 102)]


def seed(s):
    rows = [{"id": i, "name": f"p{i}"} for i in CHAIN + [201, 202]]
    s.run(
        "UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Pkg, n.name = row.name",
        rows=rows,
    ).consume()
    # Relationships need their own integer id in the UNWIND MERGE form:
    # "UNWIND relationship MERGE requires id: row.<field>".
    pairs = list(itertools.pairwise(CHAIN)) + SERVICES
    edges = [{"src": a, "dst": b, "rid": 900000 + i} for i, (a, b) in enumerate(pairs)]
    s.run(
        "UNWIND $rows AS row MATCH (s:Pkg {id: row.src}), (d:Pkg {id: row.dst}) "
        "MERGE (s)-[r:DEPENDS_ON {id: row.rid}]->(d)",
        rows=edges,
    ).consume()


# --- cases ---------------------------------------------------------------


@case("algo.MSpaths relDirection:'incoming' (reverse closure — Q1 depends on this)")
def _(s):
    rows = list(
        s.run(
            "CALL algo.MSpaths({sourceLabel: 'Pkg', sourceProperty: 'name', "
            "sourceValues: ['p108'], relTypes: ['DEPENDS_ON'], "
            "relDirection: 'incoming', maxLen: 8, pathCount: 20, resultLimit: 100}) "
            "YIELD path RETURN path"
        )
    )
    return f"{len(rows)} paths back from p108"


@case("algo.MSpaths relDirection:'outgoing'")
def _(s):
    rows = list(
        s.run(
            "CALL algo.MSpaths({sourceLabel: 'Pkg', sourceProperty: 'name', "
            "sourceValues: ['p201', 'p202'], relTypes: ['DEPENDS_ON'], "
            "relDirection: 'outgoing', maxLen: 8, pathCount: 20, resultLimit: 100}) "
            "YIELD path RETURN path"
        )
    )
    return f"{len(rows)} paths forward from 2 sources in one call"


@case("algo.MSpaths pairwise source->target")
def _(s):
    rows = list(
        s.run(
            "CALL algo.MSpaths({sourceLabel: 'Pkg', sourceProperty: 'name', "
            "sourceValues: ['p201', 'p202'], targetValues: ['p108'], "
            "pairwise: false, relTypes: ['DEPENDS_ON'], relDirection: 'outgoing', "
            "maxLen: 8, pathCount: 20, resultLimit: 100}) YIELD path RETURN path"
        )
    )
    return f"{len(rows)} paths from services to p108"


@case("bounded var-length *1..8 with rel-type filter")
def _(s):
    row = s.run("MATCH (a:Pkg {id: 201})-[:DEPENDS_ON*1..8]->(v) RETURN count(*) AS n").single(
        strict=True
    )
    return f"count={row['n']}"


@case("unbounded var-length *1..", expect="reject")
def _(s):
    s.run("MATCH (a:Pkg {id: 201})-[:DEPENDS_ON*1..]->(v) RETURN count(*) AS n").consume()
    return "accepted"


@case("OPTIONAL MATCH + count(b) — non-star aggregate", expect="reject")
def _(s):
    rows = list(
        s.run(
            "MATCH (a:Pkg) OPTIONAL MATCH (a)-[:DEPENDS_ON]->(b) "
            "RETURN a.id AS id, count(b) AS deps ORDER BY id"
        )
    )
    return f"{len(rows)} rows, first={rows[0]['id']}:{rows[0]['deps']}"


@case("relationship properties inside MERGE (UNWIND form)")
def _(s):
    s.run(
        "UNWIND $rows AS row MATCH (a:Pkg {id: row.src}), (b:Pkg {id: row.dst}) "
        "MERGE (a)-[r:RESOLVED_TO {id: row.rid}]->(b) SET r.version = row.version",
        rows=[{"src": 201, "dst": 101, "rid": 910000, "version": "4.17.21"}],
    ).consume()
    row = s.run("MATCH (a:Pkg {id: 201})-[r:RESOLVED_TO]->(b) RETURN r.version AS v").single(
        strict=True
    )
    return f"rel prop read back = {row['v']}"


@case("plain MERGE ... SET outside UNWIND", expect="reject")
def _(s):
    s.run("MERGE (n {id: 999}) SET n:Pkg, n.name = 'x'").consume()
    return "accepted"


@case("string node id — decides Phase 1 schema", expect="reject")
def _(s):
    s.run(
        "UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Pkg",
        rows=[{"id": "pkg:npm/lodash@4.17.21"}],
    ).consume()
    return "accepted"


@case("WHERE ... IN $list", expect="reject")
def _(s):
    list(s.run("MATCH (n:Pkg) WHERE n.id IN [101, 102] RETURN n.id AS id"))
    return "accepted"


@case("WHERE ... STARTS WITH $prefix (typosquat prefilter)")
def _(s):
    rows = list(s.run("MATCH (n:Pkg) WHERE n.name STARTS WITH $p RETURN n.id AS id", p="p10"))
    return f"{len(rows)} rows"


@case("max(...) aggregate — temporal queries need a plan B", expect="reject")
def _(s):
    s.run("MATCH (n:Pkg) RETURN max(n.id) AS m").consume()
    return "accepted"


@case("CREATE INDEX FOR (n:L) ON (n.p) — Neo4j 4+ syntax", expect="reject")
def _(s):
    s.run("CREATE INDEX FOR (n:Pkg) ON (n.name)").consume()
    return "accepted"


@case("UNWIND write throughput — 1000 rows")
def _(s):
    rows = [{"id": 10000 + i, "name": f"bulk{i}"} for i in range(1000)]
    t = time.perf_counter()
    s.run(
        "UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Bulk, n.name = row.name",
        rows=rows,
    ).consume()
    ms = (time.perf_counter() - t) * 1000
    return f"1000 rows in {ms:.0f} ms ({1000 / (ms / 1000):.0f} rows/s)"


@case("consistency 'strong' via Bolt explicit transaction", expect="reject")
def _(s):
    with s.begin_transaction(metadata={"hydradb.consistency": "strong"}) as tx:
        row = tx.run("MATCH (n:Pkg {id: 101}) RETURN n.name AS name").single(strict=True)
        tx.commit()
    return f"read {row['name']} under strong consistency"


@case("OPTIONAL MATCH + count(*) — the shape Q4 must actually use")
def _(s):
    rows = list(
        s.run(
            "MATCH (a:Pkg {id: 201}) OPTIONAL MATCH (a)-[:DEPENDS_ON]->(b) RETURN count(*) AS deps"
        )
    )
    return f"{len(rows)} rows, deps={rows[0]['deps']}"


@case("OPTIONAL MATCH returning properties, no aggregate")
def _(s):
    rows = list(
        s.run(
            "MATCH (a:Pkg {id: 201}) OPTIONAL MATCH (a)-[:DEPENDS_ON]->(b) "
            "RETURN a.id AS id, b.name AS dep"
        )
    )
    return f"{len(rows)} rows, first dep={rows[0]['dep']}"


@case("collect(b.name) aggregate")
def _(s):
    row = s.run(
        "MATCH (a:Pkg {id: 201})-[:DEPENDS_ON]->(b) RETURN collect(b.name) AS names"
    ).single(strict=True)
    return f"names={row['names']}"


@case("CREATE INDEX ON :Label(prop) — Neo4j 3.x syntax", expect="reject")
def _(s):
    s.run("CREATE INDEX ON :Pkg(name)").consume()
    return "accepted"


@case("MSpaths sourceValues from a parameter — forces inline literals", expect="reject")
def _(s):
    rows = list(
        s.run(
            "CALL algo.MSpaths({sourceLabel: 'Pkg', sourceProperty: 'name', "
            "sourceValues: $vals, relTypes: ['DEPENDS_ON'], relDirection: 'incoming', "
            "maxLen: 8, pathCount: 20, resultLimit: 100}) YIELD path RETURN path",
            vals=["p108"],
        )
    )
    return f"{len(rows)} paths"


@case("UNWIND batch of 1025 rows — one over the stated limit", expect="reject")
def _(s):
    rows = [{"id": 20000 + i, "name": f"b{i}"} for i in range(1025)]
    t = time.perf_counter()
    s.run(
        "UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Bulk, n.name = row.name",
        rows=rows,
    ).consume()
    ms = (time.perf_counter() - t) * 1000
    return f"1025 rows in {ms:.0f} ms"


@case(
    "MSpaths keyed on integer id — would have avoided inlining strings",
    expect="reject",
)
def _(s):
    rows = list(
        s.run(
            "CALL algo.MSpaths({sourceLabel: 'Pkg', sourceProperty: 'id', "
            "sourceValues: [108], relTypes: ['DEPENDS_ON'], relDirection: 'incoming', "
            "maxLen: 8, pathCount: 20, resultLimit: 100}) YIELD path RETURN path"
        )
    )
    return f"{len(rows)} paths back from id 108"


@case("MSpaths without sourceLabel/sourceProperty, using sourceNode id")
def _(s):
    rows = list(
        s.run(
            "CALL algo.SSpaths({sourceNode: 201, relTypes: ['DEPENDS_ON'], "
            "relDirection: 'outgoing', maxLen: 8, pathCount: 20}) YIELD path RETURN path"
        )
    )
    return f"SSpaths gave {len(rows)} paths"


@case("UNWIND batch of exactly 1024 rows — the stated ceiling")
def _(s):
    rows = [{"id": 30000 + i, "name": f"c{i}"} for i in range(1024)]
    t = time.perf_counter()
    s.run(
        "UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Bulk, n.name = row.name",
        rows=rows,
    ).consume()
    ms = (time.perf_counter() - t) * 1000
    return f"1024 rows in {ms:.0f} ms ({1024 / (ms / 1000):.0f} rows/s)"


# --- runner --------------------------------------------------------------


def main():
    with driver() as d:
        d.verify_connectivity()
        with d.session(database=DATABASE) as s:
            seed(s)

        width = max(len(n) for n, _, _ in CASES)
        ok = bad = 0
        for name, fn, expect in CASES:
            with d.session(database=DATABASE) as s:
                try:
                    detail, refused = fn(s), False
                except Exception as exc:  # noqa: BLE001 — the probe exists to catch refusals
                    detail = str(exc).split("{message: ")[-1].split("} {gql")[0][:150]
                    refused = True
            as_expected = refused == (expect == "reject")
            ok, bad = (ok + 1, bad) if as_expected else (ok, bad + 1)
            mark = "ok  " if as_expected else "SURPRISE"
            print(f"{mark}  {'reject' if refused else 'accept':<6}  {name:<{width}}  {detail}")

    print(f"\n{ok} as expected, {bad} surprising")


@case("WHERE OR-chain ceiling — 33 terms")
def or_chain_33(s):
    """Q1 batches membership as an OR chain because the engine takes no leading UNWIND and no
    `IN [...]`. 33 terms parse; MEMBERSHIP_CHUNK sits at 32 for headroom."""
    ors = " OR ".join(f"n.id = {i}" for i in range(33))
    s.run(f"MATCH (n:Version) WHERE {ors} RETURN n.key AS k LIMIT 1").data()


@case("WHERE OR-chain ceiling — 34 terms", expect="reject")
def or_chain_34(s):
    """One past the ceiling: raise MEMBERSHIP_CHUNK only if this starts passing."""
    ors = " OR ".join(f"n.id = {i}" for i in range(34))
    s.run(f"MATCH (n:Version) WHERE {ors} RETURN n.key AS k LIMIT 1").data()


@case("leading UNWIND for a read", expect="reject")
def unwind_leads(s):
    s.run("UNWIND [1, 2] AS vid MATCH (n:Version {id: vid}) RETURN n.key AS k").data()


if __name__ == "__main__":
    main()
