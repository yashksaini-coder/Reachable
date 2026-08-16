"""Hand-verified fixture graph. Every label, every relationship, every query has a
known answer AND a known non-answer here. `make fixture` wipes and reloads it.

The story (all timestamps are int epoch seconds, UTC):

  Package chalk, maintained by "sindre" (2FA) and "qix" (no 2FA).
    chalk@5.6.0  published T0          clean
    chalk@5.6.1  published T0+100      MALICIOUS, removed  <- the incident
    chalk@5.6.2  published T0+200      clean (fix)
  Package strip-ansi, also maintained by qix.       chalk@5.6.1 -> depends on strip-ansi@7.1.0
  Package ansi-regex.                                strip-ansi@7.1.0 -> ansi-regex@6.0.0
  Package chalks (typosquat of chalk, new account, "mallory")
  Package colors (unrelated, no maintainer overlap, no advisory)

  Advisory MAL-TEST-1 (malware) AFFECTS chalk@5.6.1, window [T0+100, T0+200] upper_bound.
  Advisory GHSA-TEST-CVE (cve)  AFFECTS ansi-regex@6.0.0 (ReDoS-style, no time window).

  Service webapp:  lock A (T0+150, INSIDE window)  resolves chalk@5.6.1  -> DIRECT hit  (Q3 yes)
                   lock B (T0+300, after window)   resolves chalk@5.6.2  -> fixed
  Service api:     lock C (T0+50,  BEFORE window)  resolves chalk@5.6.0  -> never exposed (Q3 no)
  Service worker:  lock D (T0+150, INSIDE window)  resolves strip-ansi@7.1.0 only,
                   which is DEPENDED ON by chalk@5.6.1 but does not depend on it -> Q1 no, Q3 no.
                   It IS exposed to GHSA-TEST-CVE via ansi-regex@6.0.0 (transitive).
  Service legacy:  lock E (T0+150, INSIDE window)  resolves colors@1.4.0 -> unrelated (all no)
  Service reachy:  lock F (T0+150, INSIDE window)  resolves chalk@5.6.1 AND its File imports chalk
                   and USES_SYMBOL chalk#default -> Q7 L2. webapp imports nothing -> Q7 L0.

Q1 (who is transitively exposed to chalk@5.6.1): webapp(A), reachy(F). NOT api, worker, legacy.
Q2 (which version introduced MAL-TEST-1): chalk@5.6.1, first at T0+100.
Q3 (resolved while live): webapp lock A, reachy lock F. NOT webapp lock B (after), api C (before).
Q4 (maintainer fan-out from chalk): qix -> strip-ansi -> worker exposed. sindre -> only chalk.
Q5 (typosquats of chalk): chalks (distance 1, kind 'insertion'). NOT colors.
Q7 (reachability): reachy L2 (symbol used); webapp L0 (present, not imported).
"""

from reachable.db import run, session
from reachable.ids import eid, gid

T0 = 1_757_300_000  # 2025-09-08T04:13:20Z, arbitrary but real-looking

NODES: dict[str, list[dict]] = {
    "Package": [
        {"key": "pkg:npm/chalk", "name": "chalk", "ecosystem": "npm", "downloads": 422_000_000},
        {
            "key": "pkg:npm/strip-ansi",
            "name": "strip-ansi",
            "ecosystem": "npm",
            "downloads": 500_000_000,
        },
        {
            "key": "pkg:npm/ansi-regex",
            "name": "ansi-regex",
            "ecosystem": "npm",
            "downloads": 520_000_000,
        },
        {"key": "pkg:npm/chalks", "name": "chalks", "ecosystem": "npm", "downloads": 12},
        {"key": "pkg:npm/colors", "name": "colors", "ecosystem": "npm", "downloads": 30_000_000},
    ],
    "Version": [
        {
            "key": "pkg:npm/chalk@5.6.0",
            "version": "5.6.0",
            "published_at": T0,
            "removed": False,
            "malicious": False,
        },
        {
            "key": "pkg:npm/chalk@5.6.1",
            "version": "5.6.1",
            "published_at": T0 + 100,
            "removed": True,
            "malicious": True,
        },
        {
            "key": "pkg:npm/chalk@5.6.2",
            "version": "5.6.2",
            "published_at": T0 + 200,
            "removed": False,
            "malicious": False,
        },
        {
            "key": "pkg:npm/strip-ansi@7.1.0",
            "version": "7.1.0",
            "published_at": T0 - 1000,
            "removed": False,
            "malicious": False,
        },
        {
            "key": "pkg:npm/ansi-regex@6.0.0",
            "version": "6.0.0",
            "published_at": T0 - 2000,
            "removed": False,
            "malicious": False,
        },
        {
            "key": "pkg:npm/chalks@0.0.1",
            "version": "0.0.1",
            "published_at": T0 + 90,
            "removed": False,
            "malicious": False,
        },
        {
            "key": "pkg:npm/colors@1.4.0",
            "version": "1.4.0",
            "published_at": T0 - 5000,
            "removed": False,
            "malicious": False,
        },
    ],
    "Maintainer": [
        {
            "key": "npm:sindre",
            "login": "sindre",
            "account_created": T0 - 300_000_000,
            "twofa": True,
            "email_domain": "example.com",
        },
        {
            "key": "npm:qix",
            "login": "qix",
            "account_created": T0 - 200_000_000,
            "twofa": False,
            "email_domain": "example.com",
        },
        {
            "key": "npm:mallory",
            "login": "mallory",
            "account_created": T0 + 80,
            "twofa": False,
            "email_domain": "mail.ru",
        },
        {
            "key": "npm:marak",
            "login": "marak",
            "account_created": T0 - 400_000_000,
            "twofa": True,
            "email_domain": "example.com",
        },
    ],
    "Advisory": [
        {
            "key": "MAL-TEST-1",
            "kind": "malware",
            "severity": "critical",
            "severity_rank": 4,
            "published_at": T0 + 180,
            "summary": "Malicious code in chalk",
        },
        {
            "key": "GHSA-TEST-CVE",
            "kind": "cve",
            "severity": "high",
            "severity_rank": 3,
            "published_at": T0 - 500,
            "summary": "ReDoS in ansi-regex",
        },
    ],
    "Service": [
        {
            "key": "svc:acme/webapp",
            "name": "webapp",
            "repo_url": "https://github.com/acme/webapp",
            "criticality": 3,
        },
        {
            "key": "svc:acme/api",
            "name": "api",
            "repo_url": "https://github.com/acme/api",
            "criticality": 3,
        },
        {
            "key": "svc:acme/worker",
            "name": "worker",
            "repo_url": "https://github.com/acme/worker",
            "criticality": 2,
        },
        {
            "key": "svc:acme/legacy",
            "name": "legacy",
            "repo_url": "https://github.com/acme/legacy",
            "criticality": 1,
        },
        {
            "key": "svc:acme/reachy",
            "name": "reachy",
            "repo_url": "https://github.com/acme/reachy",
            "criticality": 3,
        },
    ],
    "Lockfile": [
        {
            "key": "lock:acme/webapp@aaaa",
            "committed_at": T0 + 150,
            "sha": "aaaa",
            "path": "package-lock.json",
        },
        {
            "key": "lock:acme/webapp@bbbb",
            "committed_at": T0 + 300,
            "sha": "bbbb",
            "path": "package-lock.json",
        },
        {
            "key": "lock:acme/api@cccc",
            "committed_at": T0 + 50,
            "sha": "cccc",
            "path": "package-lock.json",
        },
        {
            "key": "lock:acme/worker@dddd",
            "committed_at": T0 + 150,
            "sha": "dddd",
            "path": "package-lock.json",
        },
        {
            "key": "lock:acme/legacy@eeee",
            "committed_at": T0 + 150,
            "sha": "eeee",
            "path": "package-lock.json",
        },
        {
            "key": "lock:acme/reachy@ffff",
            "committed_at": T0 + 150,
            "sha": "ffff",
            "path": "package-lock.json",
        },
    ],
    "File": [
        {"key": "file:acme/reachy:src/log.js", "path": "src/log.js", "language": "javascript"},
    ],
    "Symbol": [
        {"key": "sym:npm/chalk@5.6.1#default", "name": "default"},
    ],
}

# (type, src_label, src_key, dst_label, dst_key, props)
EDGES: list[tuple] = [
    ("VERSION_OF", "Version", "pkg:npm/chalk@5.6.0", "Package", "pkg:npm/chalk", {}),
    ("VERSION_OF", "Version", "pkg:npm/chalk@5.6.1", "Package", "pkg:npm/chalk", {}),
    ("VERSION_OF", "Version", "pkg:npm/chalk@5.6.2", "Package", "pkg:npm/chalk", {}),
    ("VERSION_OF", "Version", "pkg:npm/strip-ansi@7.1.0", "Package", "pkg:npm/strip-ansi", {}),
    ("VERSION_OF", "Version", "pkg:npm/ansi-regex@6.0.0", "Package", "pkg:npm/ansi-regex", {}),
    ("VERSION_OF", "Version", "pkg:npm/chalks@0.0.1", "Package", "pkg:npm/chalks", {}),
    ("VERSION_OF", "Version", "pkg:npm/colors@1.4.0", "Package", "pkg:npm/colors", {}),
    (
        "DEPENDS_ON",
        "Version",
        "pkg:npm/chalk@5.6.1",
        "Version",
        "pkg:npm/strip-ansi@7.1.0",
        {"range": "^7.1.0"},
    ),
    (
        "DEPENDS_ON",
        "Version",
        "pkg:npm/chalk@5.6.0",
        "Version",
        "pkg:npm/strip-ansi@7.1.0",
        {"range": "^7.1.0"},
    ),
    (
        "DEPENDS_ON",
        "Version",
        "pkg:npm/chalk@5.6.2",
        "Version",
        "pkg:npm/strip-ansi@7.1.0",
        {"range": "^7.1.0"},
    ),
    (
        "DEPENDS_ON",
        "Version",
        "pkg:npm/strip-ansi@7.1.0",
        "Version",
        "pkg:npm/ansi-regex@6.0.0",
        {"range": "^6.0.0"},
    ),
    ("MAINTAINS", "Maintainer", "npm:sindre", "Package", "pkg:npm/chalk", {}),
    ("MAINTAINS", "Maintainer", "npm:qix", "Package", "pkg:npm/chalk", {}),
    ("MAINTAINS", "Maintainer", "npm:qix", "Package", "pkg:npm/strip-ansi", {}),
    ("MAINTAINS", "Maintainer", "npm:qix", "Package", "pkg:npm/ansi-regex", {}),
    ("MAINTAINS", "Maintainer", "npm:mallory", "Package", "pkg:npm/chalks", {}),
    ("MAINTAINS", "Maintainer", "npm:marak", "Package", "pkg:npm/colors", {}),
    (
        "AFFECTS",
        "Advisory",
        "MAL-TEST-1",
        "Version",
        "pkg:npm/chalk@5.6.1",
        {"live_from": T0 + 100, "live_to": T0 + 200, "live_to_kind": "upper_bound"},
    ),
    (
        "AFFECTS",
        "Advisory",
        "GHSA-TEST-CVE",
        "Version",
        "pkg:npm/ansi-regex@6.0.0",
        {"live_from": T0 - 2000, "live_to": 4_102_444_800, "live_to_kind": "exact"},
    ),  # 2100-01-01: still live
    ("HAS_LOCKFILE", "Service", "svc:acme/webapp", "Lockfile", "lock:acme/webapp@aaaa", {}),
    ("HAS_LOCKFILE", "Service", "svc:acme/webapp", "Lockfile", "lock:acme/webapp@bbbb", {}),
    ("HAS_LOCKFILE", "Service", "svc:acme/api", "Lockfile", "lock:acme/api@cccc", {}),
    ("HAS_LOCKFILE", "Service", "svc:acme/worker", "Lockfile", "lock:acme/worker@dddd", {}),
    ("HAS_LOCKFILE", "Service", "svc:acme/legacy", "Lockfile", "lock:acme/legacy@eeee", {}),
    ("HAS_LOCKFILE", "Service", "svc:acme/reachy", "Lockfile", "lock:acme/reachy@ffff", {}),
    # RESOLVED = the flattened tree npm actually installed for that lockfile snapshot.
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/webapp@aaaa",
        "Version",
        "pkg:npm/chalk@5.6.1",
        {"at": T0 + 150},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/webapp@aaaa",
        "Version",
        "pkg:npm/strip-ansi@7.1.0",
        {"at": T0 + 150},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/webapp@aaaa",
        "Version",
        "pkg:npm/ansi-regex@6.0.0",
        {"at": T0 + 150},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/webapp@bbbb",
        "Version",
        "pkg:npm/chalk@5.6.2",
        {"at": T0 + 300},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/webapp@bbbb",
        "Version",
        "pkg:npm/strip-ansi@7.1.0",
        {"at": T0 + 300},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/webapp@bbbb",
        "Version",
        "pkg:npm/ansi-regex@6.0.0",
        {"at": T0 + 300},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/api@cccc",
        "Version",
        "pkg:npm/chalk@5.6.0",
        {"at": T0 + 50},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/api@cccc",
        "Version",
        "pkg:npm/strip-ansi@7.1.0",
        {"at": T0 + 50},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/api@cccc",
        "Version",
        "pkg:npm/ansi-regex@6.0.0",
        {"at": T0 + 50},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/worker@dddd",
        "Version",
        "pkg:npm/strip-ansi@7.1.0",
        {"at": T0 + 150},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/worker@dddd",
        "Version",
        "pkg:npm/ansi-regex@6.0.0",
        {"at": T0 + 150},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/legacy@eeee",
        "Version",
        "pkg:npm/colors@1.4.0",
        {"at": T0 + 150},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/reachy@ffff",
        "Version",
        "pkg:npm/chalk@5.6.1",
        {"at": T0 + 150},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/reachy@ffff",
        "Version",
        "pkg:npm/strip-ansi@7.1.0",
        {"at": T0 + 150},
    ),
    (
        "RESOLVED",
        "Lockfile",
        "lock:acme/reachy@ffff",
        "Version",
        "pkg:npm/ansi-regex@6.0.0",
        {"at": T0 + 150},
    ),
    ("CONTAINS", "Service", "svc:acme/reachy", "File", "file:acme/reachy:src/log.js", {}),
    ("IMPORTS", "File", "file:acme/reachy:src/log.js", "Package", "pkg:npm/chalk", {"line": 1}),
    (
        "USES_SYMBOL",
        "File",
        "file:acme/reachy:src/log.js",
        "Symbol",
        "sym:npm/chalk@5.6.1#default",
        {"line": 7},
    ),
    (
        "VULNERABLE_SYMBOL",
        "Advisory",
        "MAL-TEST-1",
        "Symbol",
        "sym:npm/chalk@5.6.1#default",
        {"inferred": True},
    ),
    (
        "NAME_SIMILAR_TO",
        "Package",
        "pkg:npm/chalks",
        "Package",
        "pkg:npm/chalk",
        {"distance": 1, "kind": "insertion"},
    ),
]


def node_rows(label: str) -> list[dict]:
    return [{"id": gid(n["key"]), **n} for n in NODES[label]]


def edge_rows() -> dict[tuple[str, str, str], list[dict]]:
    """Group by (type, src_label, dst_label) — each group is one UNWIND statement."""
    groups: dict[tuple[str, str, str], list[dict]] = {}
    for rtype, sl, sk, dl, dk, props in EDGES:
        groups.setdefault((rtype, sl, dl), []).append(
            {"src": gid(sk), "dst": gid(dk), "rid": eid(sk, rtype, dk), **props}
        )
    return groups


def set_clause(var: str, keys: list[str]) -> str:
    return ", ".join(f"{var}.{k} = row.{k}" for k in keys)


def wipe(s) -> None:
    ids = [{"id": gid(n["key"])} for rows in NODES.values() for n in rows]
    run(s, "UNWIND $rows AS row MATCH (n {id: row.id}) DETACH DELETE n", rows=ids)


def load(s) -> None:
    for label in NODES:
        rows = node_rows(label)
        keys = [k for k in rows[0] if k != "id"]
        run(
            s,
            f"UNWIND $rows AS row MERGE (n {{id: row.id}}) SET n:{label}, {set_clause('n', keys)}",
            rows=rows,
        )
    for (rtype, sl, dl), rows in edge_rows().items():
        keys = [k for k in rows[0] if k not in ("src", "dst")]  # rid + props
        sets = ["r.eid = row.rid"] + [f"r.{k} = row.{k}" for k in keys if k != "rid"]
        run(
            s,
            f"UNWIND $rows AS row MATCH (a:{sl} {{id: row.src}}), (b:{dl} {{id: row.dst}}) "
            f"MERGE (a)-[r:{rtype} {{id: row.rid}}]->(b) SET {', '.join(sets)}",
            rows=rows,
        )


def main() -> None:
    with session() as s:
        wipe(s)
        load(s)
        n = sum(len(v) for v in NODES.values())
        got = run(s, "MATCH (n:Version) RETURN count(*) AS c")[0]["c"]
        assert got == len(NODES["Version"]), (got, len(NODES["Version"]))
        print(f"fixture loaded: {n} nodes, {len(EDGES)} edges")


if __name__ == "__main__":
    main()
