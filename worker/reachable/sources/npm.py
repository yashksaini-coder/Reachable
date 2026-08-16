"""npm registry client. Every temporal fact in the graph starts here.

Key fact: when npm removes a version, its `time` entry survives but it vanishes
from `versions`. So removed = in time and not in versions. No takedown timestamp
is published anywhere; `next_surviving_publish` is the live_to upper-bound proxy.
"""

import re
from datetime import datetime

from reachable.http import get_json
from reachable.ids import SEMVER, pkg_key, safe_name
from reachable.load import log

REGISTRY = "https://registry.npmjs.org"
DOWNLOADS = "https://api.npmjs.org/downloads/point/last-week"
LOGIN = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
_META = {"created", "modified"}


def _ts(s: str) -> int:
    return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())


def fetch_packument(name: str) -> dict | None:
    """Full packument (has the `time` map). None on 404 or on a name safe_name rejects."""
    try:
        name = safe_name(name)
    except ValueError as e:
        log(f"npm: skip {e}")
        return None
    return get_json(f"{REGISTRY}/{name.replace('/', '%2F')}", ok404=True)


def package_row(doc: dict) -> dict:
    return {"key": pkg_key(doc["name"]), "name": doc["name"], "ecosystem": "npm", "downloads": None}


def _times(doc: dict) -> dict[str, int]:
    """version -> published_at for every semver-valid version in `time`, sorted by time."""
    out = {}
    for v, t in doc.get("time", {}).items():
        if v in _META:
            continue
        if not SEMVER.match(v):
            log(f"npm: skip non-semver version {doc['name']}@{v!r}")
            continue
        out[v] = _ts(t)
    return dict(sorted(out.items(), key=lambda kv: kv[1]))


def version_rows(doc: dict) -> list[dict]:
    pkg = pkg_key(doc["name"])
    live = doc.get("versions", {})
    return [
        {
            "key": f"{pkg}@{v}",
            "version": v,
            "published_at": t,
            "removed": v not in live,
            "malicious": False,
        }
        for v, t in _times(doc).items()
    ]


def version_of_edges(doc: dict) -> list[dict]:
    pkg = pkg_key(doc["name"])
    return [{"src": f"{pkg}@{v}", "dst": pkg} for v in _times(doc)]


def _logins(doc: dict) -> list[tuple[str, str | None]]:
    out = []
    for m in doc.get("maintainers", []) or []:
        login = (m.get("name") or "") if isinstance(m, dict) else ""
        if not LOGIN.match(login):
            log(f"npm: skip maintainer login {login!r} on {doc['name']}")
            continue
        email = m.get("email") or ""
        out.append((login, email.rsplit("@", 1)[1] if "@" in email else None))
    return out


def maintainer_rows(doc: dict) -> list[dict]:
    return [
        {
            "key": f"npm:{login}",
            "login": login,
            "account_created": None,
            "twofa": None,
            "email_domain": dom,
        }
        for login, dom in _logins(doc)
    ]


def maintains_edges(doc: dict) -> list[dict]:
    pkg = pkg_key(doc["name"])
    return [{"src": f"npm:{login}", "dst": pkg} for login, _ in _logins(doc)]


def downloads(names: list[str]) -> dict[str, int]:
    """Weekly downloads. Unscoped bulk 128/req; scoped singly (bulk 400s on them). Missing -> 0."""
    out = {n: 0 for n in names}
    scoped = [n for n in names if n.startswith("@")]
    plain = [n for n in names if not n.startswith("@")]
    for n in scoped:
        d = get_json(f"{DOWNLOADS}/{n}", ok404=True)
        out[n] = int((d or {}).get("downloads") or 0)
    for i in range(0, len(plain), 128):
        chunk = plain[i : i + 128]
        d = get_json(f"{DOWNLOADS}/{','.join(chunk)}", ok404=True) or {}
        if len(chunk) == 1:  # single-name response is not keyed by name
            d = {chunk[0]: d}
        for n in chunk:
            out[n] = int((d.get(n) or {}).get("downloads") or 0)
    return out


def next_surviving_publish(doc: dict, version: str) -> int | None:
    """published_at of the earliest non-removed version published strictly after `version`."""
    times = _times(doc)
    if version not in times:
        return None
    t0 = times[version]
    live = doc.get("versions", {})
    later = [t for v, t in times.items() if t > t0 and v in live]
    return min(later) if later else None


def ingest_package(name: str) -> dict | None:
    doc = fetch_packument(name)
    if doc is None:
        return None
    return {
        "package": package_row(doc),
        "versions": version_rows(doc),
        "version_of": version_of_edges(doc),
        "maintainers": maintainer_rows(doc),
        "maintains": maintains_edges(doc),
    }


if __name__ == "__main__":
    doc = fetch_packument("chalk")
    assert doc is not None
    vs = {r["version"]: r for r in version_rows(doc)}
    assert vs["5.6.1"]["removed"] is True and vs["5.6.1"]["published_at"] == 1757337185
    assert vs["5.6.2"]["removed"] is False
    assert next_surviving_publish(doc, "5.6.1") == 1757342874
    assert next_surviving_publish(doc, "5.6.2") in (None, *[t for t in _times(doc).values()])
    ms = maintainer_rows(doc)
    assert ms and all(m["key"].startswith("npm:") for m in ms)
    assert len(version_of_edges(doc)) == len(vs)
    assert all(isinstance(r["published_at"], int) for r in vs.values())

    tc = fetch_packument("@ctrl/tinycolor")
    assert tc is not None
    tcv = {r["version"]: r for r in version_rows(tc)}
    assert tcv["4.1.1"]["removed"] is True and tcv["4.1.2"]["removed"] is True
    assert tcv["4.1.1"]["key"] == "pkg:npm/@ctrl/tinycolor@4.1.1"

    dl = downloads(["chalk", "@ctrl/tinycolor"])
    assert dl["chalk"] > 0 and dl["@ctrl/tinycolor"] > 0, dl

    assert fetch_packument("this-package-does-not-exist-reachable-xyz") is None
    assert ingest_package("Chalk") is None  # rejected name: skipped, not raised
    ing = ingest_package("chalk")
    assert ing and ing["package"]["key"] == "pkg:npm/chalk"
    print(
        f"npm ok: chalk {len(vs)} versions ({sum(r['removed'] for r in vs.values())} removed), "
        f"{len(ms)} maintainers, dl={dl['chalk']}; @ctrl/tinycolor {len(tcv)} versions "
        f"({sum(r['removed'] for r in tcv.values())} removed), dl={dl['@ctrl/tinycolor']}"
    )
