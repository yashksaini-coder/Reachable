"""OSV advisories -> Advisory nodes and AFFECTS edges with the temporal window.

api.osv.dev facts this relies on: `affected[].versions[]` is the concrete list of
bad versions when present; `ranges[].events` "fixed" is a semver BOUNDARY that may
never have existed on npm, so it is only used to expand a range against a
caller-supplied `known_versions` list. querybatch is positional and a no-hit
result is `{}`, not `{"vulns": []}`.
"""

import re
from datetime import datetime
from urllib.parse import quote

from reachable.http import get_json, post_json
from reachable.ids import safe_name, safe_purl
from reachable.load import log

OSV = "https://api.osv.dev/v1"
UNBOUNDED = 4102444800  # 2100-01-01T00:00:00Z: "still live"
RANK = {"critical": 4, "high": 3, "medium": 2, "moderate": 2, "low": 1}
_SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$")


def _ts(iso: str) -> int:
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp())


def _semver_key(v: str) -> tuple | None:
    m = _SEMVER.match(v)
    if not m:
        return None
    pre = m.group(4)
    # a prerelease sorts before its release: (…, 0, ids) < (…, 1, ())
    ids = tuple((0, int(p)) if p.isdigit() else (1, p) for p in pre.split(".")) if pre else ()
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)), 0 if pre else 1, ids)


def fetch_vuln(vid: str) -> dict | None:
    return get_json(f"{OSV}/vulns/{vid}", ok404=True)


def _is_malware(rec: dict) -> bool:
    ds = rec.get("database_specific") or {}
    return (
        rec["id"].startswith("MAL-")
        or any(a.startswith("MAL-") for a in rec.get("aliases") or [])
        or (rec.get("summary") or "").startswith("Malicious code in")
        or "CWE-506" in (ds.get("cwe_ids") or [])
    )


def advisory_row(rec: dict) -> dict:
    kind = "malware" if _is_malware(rec) else "cve"
    sev = ((rec.get("database_specific") or {}).get("severity") or "").lower()
    if kind == "malware" and not sev:
        sev = "critical"
    if sev == "moderate":
        sev = "medium"
    return {
        "key": rec["id"],
        "kind": kind,
        "severity": sev or "unknown",
        "severity_rank": RANK.get(sev, 0),
        "published_at": _ts(rec["published"]),
        "summary": (rec.get("summary") or rec.get("details") or "")[:300],
    }


def _expand(events: list[dict], known: list[str]) -> list[str]:
    # OSV events are ordered; each "introduced" opens a window, the next
    # "fixed"/"last_affected" closes it. One range may hold several windows.
    wins: list[list] = []  # [lo_key|None, hi_key|None, inclusive]
    for e in events:
        if "introduced" in e:
            lo = e["introduced"]
            wins.append([_semver_key(lo) if lo != "0" else None, None, False])
        elif wins and ("fixed" in e or "last_affected" in e):
            hi = e.get("fixed") or e["last_affected"]
            wins[-1][1], wins[-1][2] = _semver_key(hi), "last_affected" in e
    out = []
    for v in known:
        k = _semver_key(v)
        if k is None:
            continue
        for lo_k, hi_k, inclusive in wins:
            if lo_k and k < lo_k:
                continue
            if hi_k and (k > hi_k if inclusive else k >= hi_k):
                continue
            out.append(v)
            break
    return out


def affected_pairs(
    rec: dict, known_versions: dict[str, list[str]] | None = None
) -> list[tuple[str, str]]:
    pairs: set[tuple[str, str]] = set()
    for a in rec.get("affected") or []:
        pkg = a.get("package") or {}
        if pkg.get("ecosystem") != "npm":
            continue
        try:
            name = safe_name(pkg.get("name", ""))
        except ValueError as e:
            log(f"osv {rec['id']}: {e}")
            continue
        versions = list(a.get("versions") or [])
        if not versions and known_versions and name in known_versions:
            for r in a.get("ranges") or []:
                if r.get("type") == "SEMVER":
                    versions += _expand(r.get("events") or [], known_versions[name])
        for v in versions:
            try:
                safe_purl(name, v)
            except ValueError as e:
                log(f"osv {rec['id']}: {e}")
                continue
            pairs.add((name, v))
    return sorted(pairs)


def affects_edges(
    rec: dict,
    windows: dict[tuple[str, str], dict],
    known_versions: dict[str, list[str]] | None = None,
) -> list[dict]:
    adv = advisory_row(rec)
    rows = []
    for name, ver in affected_pairs(rec, known_versions):
        w = windows.get((name, ver))
        if w is None:
            log(f"osv {rec['id']}: no window for {name}@{ver}, skipped")
            continue
        live_to, kind = UNBOUNDED, "exact"
        if adv["kind"] == "malware":
            # A bound that predates the publish is not a bound (advisory published before
            # a later-added bad version shipped) — only bounds after live_from count.
            cands = [
                t
                for t in (w.get("next_surviving"), adv["published_at"])
                if t is not None and t >= w["published_at"]
            ]
            if cands:
                live_to, kind = min(cands), "upper_bound"
        rows.append(
            {
                "src": rec["id"],
                "dst": safe_purl(name, ver),
                "live_from": int(w["published_at"]),
                "live_to": int(live_to),
                "live_to_kind": kind,
            }
        )
    return rows


def _purl(name: str) -> str:
    return "pkg:npm/" + quote(name, safe="")


def query_batch(pairs: list[tuple[str, str]]) -> dict[tuple[str, str], list[str]]:
    out: dict[tuple[str, str], list[str]] = {}
    for i in range(0, len(pairs), 1000):
        chunk = pairs[i : i + 1000]
        body = {"queries": [{"package": {"purl": _purl(n)}, "version": v} for n, v in chunk]}
        res = post_json(f"{OSV}/querybatch", body)["results"]
        assert len(res) == len(chunk), "querybatch is positional"
        for pair, r in zip(chunk, res, strict=True):
            out[pair] = [v["id"] for v in (r or {}).get("vulns") or []]
    return out


def ingest_advisory(
    vid: str,
    windows: dict[tuple[str, str], dict],
    known_versions: dict[str, list[str]] | None = None,
) -> dict:
    rec = fetch_vuln(vid)
    if rec is None:
        raise KeyError(f"no OSV record {vid}")
    return {
        "advisory": advisory_row(rec),
        "pairs": affected_pairs(rec, known_versions),
        "affects": affects_edges(rec, windows, known_versions),
    }


if __name__ == "__main__":
    # semver compare
    assert _semver_key("1.0.0-alpha") < _semver_key("1.0.0") < _semver_key("1.0.1")
    assert _semver_key("1.0.0-alpha.1") < _semver_key("1.0.0-alpha.2") < _semver_key("1.0.0-beta")
    assert _expand(
        [{"introduced": "1.0.0"}, {"fixed": "1.2.0"}], ["0.9.0", "1.0.0", "1.1.9", "1.2.0"]
    ) == ["1.0.0", "1.1.9"]
    assert _expand([{"introduced": "0"}, {"last_affected": "1.1.0"}], ["1.1.0", "1.1.1"]) == [
        "1.1.0"
    ]
    # multi-window range and an open-ended tail
    assert _expand(
        [{"introduced": "1.0.0"}, {"fixed": "1.1.0"}, {"introduced": "2.0.0"}],
        ["0.5.0", "1.0.5", "1.1.0", "1.5.0", "2.0.0", "3.0.0"],
    ) == ["1.0.5", "2.0.0", "3.0.0"]
    # affects_edges honours known_versions for range-only records
    fake = {
        "id": "MAL-0000-1",
        "published": "2025-09-08T20:00:00Z",
        "affected": [
            {
                "package": {"ecosystem": "npm", "name": "x"},
                "ranges": [
                    {"type": "SEMVER", "events": [{"introduced": "1.0.0"}, {"fixed": "1.0.2"}]}
                ],
            }
        ],
    }
    fw = {("x", "1.0.1"): {"published_at": 100, "next_surviving": None}}
    fr = affects_edges(fake, fw, {"x": ["0.9.0", "1.0.1", "1.0.2"]})
    assert [r["dst"] for r in fr] == ["pkg:npm/x@1.0.1"] and fr[0]["live_to"] == _ts(
        fake["published"]
    )
    assert affects_edges(fake, fw) == []

    ts = fetch_vuln("GHSA-g7cv-rxg3-hmpx")
    ta = advisory_row(ts)
    tp = affected_pairs(ts)
    assert ta["kind"] == "malware", ta
    assert len(tp) == 84, len(tp)
    assert len({n for n, _ in tp}) == 42
    assert ("@tanstack/router-core", "1.169.5") in tp

    mal = fetch_vuln("MAL-2025-47141")
    assert advisory_row(mal)["kind"] == "malware"
    assert set(affected_pairs(mal)) == {
        ("@ctrl/tinycolor", "4.1.1"),
        ("@ctrl/tinycolor", "4.1.2"),
    }, affected_pairs(mal)

    qb = query_batch([("chalk", "5.6.1"), ("chalk", "5.6.2"), ("@ctrl/tinycolor", "4.1.1")])
    assert len(qb[("chalk", "5.6.1")]) >= 1, qb
    assert qb[("chalk", "5.6.2")] == [], qb
    assert len(qb[("@ctrl/tinycolor", "4.1.1")]) >= 1, qb

    chalk_id = qb[("chalk", "5.6.1")][0]
    chalk = fetch_vuln(chalk_id)
    win = {("chalk", "5.6.1"): {"published_at": 1757337185, "next_surviving": 1757342874}}
    rows = affects_edges(chalk, win)
    row = next(r for r in rows if r["dst"] == "pkg:npm/chalk@5.6.1")
    adv_pub = advisory_row(chalk)["published_at"]
    assert row["live_from"] == 1757337185
    assert row["live_to"] == min(1757342874, adv_pub), (row, adv_pub)
    assert row["live_to_kind"] == "upper_bound"
    assert isinstance(row["live_to"], int)
    print(
        f"osv ok: tanstack pairs={len(tp)} pkgs=42 kind={ta['kind']} sev={ta['severity']}/{ta['severity_rank']}; "
        f"tinycolor pairs={len(affected_pairs(mal))}; batch={ {k: len(v) for k, v in qb.items()} }; "
        f"chalk adv={chalk_id} kind={advisory_row(chalk)['kind']} affects_rows={len(rows)} live_to={row['live_to']}"
    )
