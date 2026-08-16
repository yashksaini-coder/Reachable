"""Golden test for the composed incident payload — the JSON contract the web console reads.
Numbers come from the fixture story in fixture.py; needs a running node."""

import json

import pytest
from reachable import fixture, incident
from reachable.db import session


@pytest.fixture(scope="session")
def payload():
    with session() as s:
        fixture.wipe(s)
        fixture.load(s)
        return incident.compose(s, "MAL-TEST-1")


def test_headline(payload):
    assert payload["headline"] == {
        "services_exposed": 2,  # webapp(A), reachy(F)
        "lockfiles_exposed": 2,
        "resolved_while_live": 2,
        "reachable_L2": 1,  # reachy
        "imported_L1": 0,
        "present_only_L0": 1,  # webapp: scanned, nothing imported
        "unscanned": 0,  # legacy is unscanned but not exposed
    }


def test_sections_carry_cypher_and_limitations(payload):
    for k in ("q1_exposed", "q1_mspaths", "q2_versions", "q3_while_live", "q4_maintainers"):
        sec = payload[k]
        assert set(sec) >= {"rows", "ms", "cypher", "limitations", "truncated"}, k
        assert sec["cypher"] and all(sec["cypher"]), k
        assert sec["limitations"], k
    for sec in payload["q5_typosquats"].values():
        assert sec["cypher"] and sec["limitations"]
    for sec in payload["q7_reachability"].values():
        assert sec["cypher"] and sec["level"] in ("L0", "L1", "L2", "unscanned")
    for k in ("q1_exposed", "q1_mspaths"):
        assert {"runs", "cold_ms", "warm_p50_ms", "warm_p95_ms"} <= set(payload[k]["timing"])


def test_evidence_and_paths(payload):
    q3 = payload["q3_while_live"]
    assert {r["evidence"] for r in q3["rows"]} == {"in_window+pinned_removed"}
    assert q3["in_window"] == 2 and q3["pinned_removed"] == 2
    q1 = payload["q1_exposed"]
    assert sorted(r["service"] for r in q1["rows"]) == ["svc:acme/reachy", "svc:acme/webapp"]
    for r in q1["rows"]:
        assert r["paths"] and r["paths"][0]["chain"][0] == "pkg:fx/chalk@5.6.1"
        assert r["paths"][0]["chain"][-1] == r["lockfile"]
    assert payload["provenance"]["graph"]["Service"] >= 5
    json.dumps(payload, sort_keys=True)  # serialisable, as --out writes it
