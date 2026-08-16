"""Golden answers, verified BY HAND against the fixture story in fixture.py.

Every test asserts a known answer AND a known non-answer. Needs a running node
(`make node`); the fixture is reloaded once per session.
"""

import pytest
from reachable import fixture, queries
from reachable.db import session


@pytest.fixture(scope="session")
def s():
    with session() as sess:
        fixture.wipe(sess)
        fixture.load(sess)
        yield sess


BAD = "pkg:fx/chalk@5.6.1"


def test_q1_exposed_services(s):
    r = queries.q1_exposed_services(s, [BAD])
    assert r.meta["services"] == ["svc:acme/reachy", "svc:acme/webapp"]
    # api resolved 5.6.0, worker only depends UPWARD of chalk, legacy is unrelated
    webapp = next(row for row in r.rows if row["service"] == "svc:acme/webapp")
    assert webapp["lockfile"] == "lock:acme/webapp@aaaa" and webapp["sha"] == "aaaa"
    assert webapp["hops"] == 0  # resolved the bad version directly
    assert webapp["paths"][0]["chain"][0] == BAD
    assert webapp["paths"][0]["chain"][-1] == "lock:acme/webapp@aaaa"
    assert r.cypher and "RESOLVED" in r.cypher[0]  # executed statement is carried for the UI


def test_q1_multi_source(s):
    # Both bad and clean version: clean 5.6.0 is resolved by api only.
    r = queries.q1_exposed_services(s, [BAD, "pkg:fx/chalk@5.6.0"], explain=False)
    assert r.meta["services"] == ["svc:acme/api", "svc:acme/reachy", "svc:acme/webapp"]


def test_q1_blast_radius_one_mspaths_call(s):
    svcs = [f"svc:acme/{n}" for n in ("webapp", "api", "worker", "legacy", "reachy")]
    r = queries.q1_blast_radius_count(s, [BAD, "pkg:fx/chalk@5.6.0"], svcs)
    pairs = {(row["bad"], row["service"]) for row in r.rows}
    assert pairs == {
        (BAD, "svc:acme/webapp"),
        (BAD, "svc:acme/reachy"),
        ("pkg:fx/chalk@5.6.0", "svc:acme/api"),
    }, pairs
    assert not r.truncated and len(r.cypher) == 1 and "algo.MSpaths" in r.cypher[0]


def test_q1_unknown_source_is_empty_not_error(s):
    r = queries.q1_exposed_services(s, ["pkg:fx/does-not-exist@0.0.0"])
    assert r.rows == []


def test_q2_first_affected(s):
    r = queries.q2_affected_versions(s, "MAL-TEST-1")
    assert r.meta["first"]["version"] == BAD
    assert r.meta["first"]["published_at"] == fixture.T0 + 100
    assert [row["version"] for row in r.rows] == [BAD]
    assert r.rows[0]["live_to_kind"] == "upper_bound"


def test_q3_resolved_while_live(s):
    r = queries.q3_resolved_while_live(s, "MAL-TEST-1")
    hits = {(row["service"], row["lockfile"]) for row in r.rows}
    assert hits == {
        ("svc:acme/webapp", "lock:acme/webapp@aaaa"),  # T0+150, inside [T0+100, T0+200]
        ("svc:acme/reachy", "lock:acme/reachy@ffff"),  # T0+150, inside
    }, hits
    # webapp@bbbb is AFTER the window (T0+300) and resolves the FIXED 5.6.2; api@cccc is
    # BEFORE (T0+50) with the clean 5.6.0. Neither pins a removed version, so neither appears.
    assert r.meta["services"] == ["svc:acme/reachy", "svc:acme/webapp"]
    assert all(row["evidence"] == "in_window+pinned_removed" for row in r.rows)
    assert r.meta == {"services": r.meta["services"], "in_window": 2, "pinned_removed": 2}
    assert len(r.cypher) == 2 and "r.at >= af.live_from" in r.cypher[0]
    assert "v.removed = true" in r.cypher[1]


def test_q3_open_window_cve(s):
    # GHSA-TEST-CVE affects ansi-regex@6.0.0 with an open-ended window: everyone whose
    # flattened tree contains ansi-regex (all but legacy) is a hit — transitively via
    # strip-ansi/chalk, yet ONE hop on RESOLVED because the lockfile is the closure.
    r = queries.q3_resolved_while_live(s, "GHSA-TEST-CVE")
    services = {row["service"] for row in r.rows}
    assert services == {"svc:acme/webapp", "svc:acme/api", "svc:acme/worker", "svc:acme/reachy"}
    assert "svc:acme/legacy" not in services


def test_q4_maintainer_fanout(s):
    r = queries.q4_maintainer_fanout(s, BAD)
    logins = {m["login"] for m in r.meta["maintainers"]}
    assert logins == {"fx:sindre", "fx:qix"}
    by_pkg = {row["package"]: row for row in r.rows}
    # qix also maintains strip-ansi and ansi-regex; sindre maintains only chalk
    assert set(by_pkg) == {"pkg:fx/strip-ansi", "pkg:fx/ansi-regex"}
    assert "pkg:fx/chalk" not in by_pkg  # the bad package itself is not "other"
    assert "pkg:fx/colors" not in by_pkg  # marak shares nothing
    # worker resolves strip-ansi directly and never touches chalk — Q4 finds it, Q1 does not
    assert "svc:acme/worker" in by_pkg["pkg:fx/strip-ansi"]["services_at_risk"]
    assert by_pkg["pkg:fx/strip-ansi"]["maintainers"] == ["fx:qix"]
    qix = next(m for m in r.meta["maintainers"] if m["login"] == "fx:qix")
    assert qix["twofa"] is False


def test_q5_typosquats(s):
    r = queries.q5_typosquats(s, "pkg:fx/chalk")
    assert [row["package"] for row in r.rows] == ["pkg:fx/chalks"]
    row = r.rows[0]
    assert row["distance"] == 1 and row["kind"] == "insertion"
    assert row["maintainer"] == "fx:mallory" and row["twofa"] is False
    assert row["account_created"] > fixture.T0  # created after the incident started


def test_q7_reachability_levels(s):
    lvl = lambda svc: queries.q7_reachability(s, "MAL-TEST-1", svc).meta["level"]
    assert lvl("svc:acme/reachy") == "L2"  # symbol referenced
    assert lvl("svc:acme/webapp") == "L0"  # scanned, nothing imported
    assert lvl("svc:acme/legacy") == "unscanned"  # no File nodes: never claim safe


def test_every_query_reports_latency(s):
    for r in (
        queries.q1_exposed_services(s, [BAD]),
        queries.q2_affected_versions(s, "MAL-TEST-1"),
        queries.q3_resolved_while_live(s, "MAL-TEST-1"),
        queries.q4_maintainer_fanout(s, BAD),
        queries.q5_typosquats(s, "pkg:fx/chalk"),
    ):
        assert r.ms > 0
