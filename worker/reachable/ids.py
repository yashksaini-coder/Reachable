"""Integer ids and the npm-name allowlist. See docs/schema.md.

HydraDB ids must be non-negative integers, so every human key is hashed.
blake2b, not hash(): PYTHONHASHSEED randomises hash() per process, and a
non-deterministic id turns every re-ingest into a full duplicate of the graph.
52 bits, not 63: JSON numbers above 2^53 lose precision in the browser.
"""

import hashlib
import re


def gid(key: str) -> int:
    """Deterministic 52-bit node id from a human key. Stable across runs and machines."""
    return int.from_bytes(hashlib.blake2b(key.encode(), digest_size=8).digest(), "big") >> 12


def eid(src_key: str, rel_type: str, dst_key: str) -> int:
    """Relationship id from its endpoints. No parallel edges exist in this schema."""
    return gid(f"{src_key}|{rel_type}|{dst_key}")


# npm rules: ≤214 chars total, lowercase, URL-safe, optional @scope/.
# Deliberately stricter than npm (no leading '.' or '_', no uppercase legacy names):
# the only names it drops are ones no real advisory has produced.
NPM_NAME = re.compile(r"^(?:@[a-z0-9][a-z0-9._-]{0,212}/)?[a-z0-9][a-z0-9._-]{0,213}$")
SEMVER = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")


def safe_name(name: str) -> str:
    """Allowlist an npm package name. Reject, never escape — these reach inline Cypher literals."""
    if len(name) > 214 or not NPM_NAME.match(name):
        raise ValueError(f"rejected npm name: {name!r}")
    return name


def safe_purl(name: str, version: str) -> str:
    safe_name(name)
    if not SEMVER.match(version):
        raise ValueError(f"rejected version: {version!r}")
    return f"pkg:npm/{name}@{version}"


def pkg_key(name: str) -> str:
    return f"pkg:npm/{safe_name(name)}"


def cypher_str_list(values: list[str]) -> str:
    """Render an inline Cypher string list for algo.* sourceValues.

    Every value must already have passed safe_name/safe_purl — the allowlist
    contains no quote, backslash or newline, so plain quoting is safe.
    """
    for v in values:
        if not re.fullmatch(r"[A-Za-z0-9@/:._+#-]+", v):
            raise ValueError(f"unsafe literal: {v!r}")
    return "[" + ", ".join(f"'{v}'" for v in values) + "]"


if __name__ == "__main__":
    assert gid("pkg:npm/chalk") == gid("pkg:npm/chalk")
    assert 0 <= gid("x") < 2**52
    assert eid("a", "R", "b") != eid("b", "R", "a")
    assert safe_purl("@ctrl/tinycolor", "4.1.1") == "pkg:npm/@ctrl/tinycolor@4.1.1"
    assert safe_purl("chalk", "5.6.1-beta.1+build") == "pkg:npm/chalk@5.6.1-beta.1+build"
    for bad in ["Chalk", "chalk'", "a b", "@/x", "../x", "x" * 215]:
        try:
            safe_name(bad)
            raise SystemExit(f"should have rejected {bad!r}")
        except ValueError:
            pass
    try:
        safe_purl("chalk", "5.6")
        raise SystemExit("should have rejected short semver")
    except ValueError:
        pass
    assert cypher_str_list(["pkg:npm/chalk@5.6.1"]) == "['pkg:npm/chalk@5.6.1']"
    print("ids ok")
