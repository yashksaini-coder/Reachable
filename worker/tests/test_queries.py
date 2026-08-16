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


BAD = "pkg:npm/chalk@5.6.1"


def test_q1_exposed_services(s):
    r = queries.q1_exposed_services(s, [BAD])
    services = {row["service"] for row in r.rows}
    assert services == {"svc:acme/webapp", "svc:acme/reachy"}, services
    # api resolved 5.6.0, worker only depends UPWARD of chalk, legacy is unrelated
    assert not r.truncated
    webapp = next(row for row in r.rows if row["service"] == "svc:acme/webapp")
    assert webapp["hops"] == 0  # resolved the bad version directly
    assert webapp["path"][0] == BAD and webapp["path"][-1] == "svc:acme/webapp"


def test_q1_multi_source_one_call(s):
    # Both bad and clean version as sources: clean 5.6.0 is resolved by api only.
    r = queries.q1_exposed_services(s, [BAD, "pkg:npm/chalk@5.6.0"])
    assert {row["service"] for row in r.rows} == {
        "svc:acme/webapp",
        "svc:acme/reachy",
        "svc:acme/api",
    }


def test_q1_unknown_source_is_empty_not_error(s):
    r = queries.q1_exposed_services(s, ["pkg:npm/does-not-exist@0.0.0"])
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
    # webapp@bbbb is AFTER the window (T0+300); api@cccc is BEFORE (T0+50); both excluded
    assert all(row["via"] == "direct" for row in r.rows)
    assert r.meta == {"direct": 2, "transitive": 0}


def test_q3_transitive_arm(s):
    # GHSA-TEST-CVE affects ansi-regex@6.0.0 with an open-ended window: everyone who
    # resolved ansi-regex directly (all but legacy) is a direct hit; the transitive arm
    # must not double-count them.
    r = queries.q3_resolved_while_live(s, "GHSA-TEST-CVE")
    services = {row["service"] for row in r.rows}
    assert services == {"svc:acme/webapp", "svc:acme/api", "svc:acme/worker", "svc:acme/reachy"}
    assert "svc:acme/legacy" not in services
    keys = [(row["service"], row["lockfile"], row["version"]) for row in r.rows]
    assert len(keys) == len(set(keys)), "duplicate rows across arms"


def test_q4_maintainer_fanout(s):
    r = queries.q4_maintainer_fanout(s, BAD)
    logins = {m["login"] for m in r.meta["maintainers"]}
    assert logins == {"npm:sindre", "npm:qix"}
    by_pkg = {row["package"]: row for row in r.rows}
    # qix also maintains strip-ansi and ansi-regex; sindre maintains only chalk
    assert set(by_pkg) == {"pkg:npm/strip-ansi", "pkg:npm/ansi-regex"}
    assert "pkg:npm/chalk" not in by_pkg  # the bad package itself is not "other"
    assert "pkg:npm/colors" not in by_pkg  # marak shares nothing
    # worker resolves strip-ansi directly and never touches chalk — Q4 finds it, Q1 does not
    assert "svc:acme/worker" in by_pkg["pkg:npm/strip-ansi"]["services_at_risk"]
    assert by_pkg["pkg:npm/strip-ansi"]["maintainers"] == [{"login": "npm:qix", "twofa": False}]


def test_q5_typosquats(s):
    r = queries.q5_typosquats(s, "pkg:npm/chalk")
    assert [row["package"] for row in r.rows] == ["pkg:npm/chalks"]
    row = r.rows[0]
    assert row["distance"] == 1 and row["kind"] == "insertion"
    assert row["maintainer"] == "npm:mallory" and row["twofa"] is False
    assert row["account_created"] > fixture.T0  # created after the incident started


def test_q7_reachability_levels(s):
    assert queries.q7_reachability(s, "MAL-TEST-1", "svc:acme/reachy").meta["level"] == "L2"
    assert queries.q7_reachability(s, "MAL-TEST-1", "svc:acme/webapp").meta["level"] == "L0"


def test_every_query_reports_latency(s):
    for r in (
        queries.q1_exposed_services(s, [BAD]),
        queries.q2_affected_versions(s, "MAL-TEST-1"),
        queries.q3_resolved_while_live(s, "MAL-TEST-1"),
        queries.q4_maintainer_fanout(s, BAD),
        queries.q5_typosquats(s, "pkg:npm/chalk"),
    ):
        assert r.ms > 0
