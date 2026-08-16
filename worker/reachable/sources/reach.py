"""Reachability L0/L1: does first-party code import the affected package at all?

For a service at a given commit, list its JS/TS files (GitHub tree API), read them, and find
import/require of the packages named in an advisory. Produces File nodes, CONTAINS and
IMPORTS edges. Symbol-level (L2) needs tree-sitter and is deliberately out of scope; L1 alone
already separates "present in the tree" from "actually imported by your code".

Bounded: first-party only (no node_modules/dist/build/vendor), MAX_FILES per repo, and only
the packages we are asked about — the scan is per incident, not per repo.
"""

import os
import re
from urllib.parse import quote

from reachable.http import get_json, request
from reachable.ids import safe_name
from reachable.load import log

API = "https://api.github.com"
MAX_FILES = 400
SRC_EXT = (".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts", ".vue", ".svelte")
SKIP_DIRS = (
    "node_modules/",
    "dist/",
    "build/",
    "vendor/",
    ".next/",
    "out/",
    "coverage/",
    "public/",
    "static/",
)

_TOKEN = os.environ.get("GITHUB_TOKEN")
_HDR = {"Authorization": f"Bearer {_TOKEN}"} if _TOKEN else {}


def source_files(slug: str, sha: str) -> list[str]:
    """First-party source paths at a commit. Uses the recursive tree API (one call)."""
    t = get_json(f"{API}/repos/{slug}/git/trees/{sha}?recursive=1", headers=_HDR, ok404=True)
    if not t:
        return []
    if t.get("truncated"):
        log(f"reach: {slug}@{sha[:12]} tree truncated by GitHub; scan is partial")
    out = []
    for e in t.get("tree", []):
        p = e.get("path", "")
        if e.get("type") != "blob" or not p.endswith(SRC_EXT):
            continue
        if any(seg in p for seg in SKIP_DIRS) or p.endswith((".d.ts", ".min.js")):
            continue
        out.append(p)
    return sorted(out)[:MAX_FILES]


def read_file(slug: str, sha: str, path: str) -> str | None:
    r = request(
        "GET", f"https://raw.githubusercontent.com/{slug}/{sha}/{quote(path)}", headers=_HDR
    )
    return r["body"] if r["status"] == 200 else None


# import x from 'pkg' · import 'pkg' · require('pkg') · import('pkg') · export … from 'pkg'
_IMPORT = re.compile(
    r"""(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)"""
)


def imports_in(text: str) -> list[tuple[str, int]]:
    """(package_name, line) for every bare-specifier import. Subpaths map to their package."""
    out = []
    for i, line in enumerate(text.splitlines(), 1):
        if "import" not in line and "require" not in line and "export" not in line:
            continue
        for m in _IMPORT.finditer(line):
            spec = next(g for g in m.groups() if g)
            if spec.startswith((".", "/", "node:", "http:", "https:", "data:", "#")):
                continue
            parts = spec.split("/")
            name = "/".join(parts[:2]) if spec.startswith("@") else parts[0]
            try:
                out.append((safe_name(name), i))
            except ValueError:
                continue
    return out


def scan_service(slug: str, sha: str, packages: set[str]) -> dict:
    """File/CONTAINS/IMPORTS rows for the given packages. `packages` are bare npm names."""
    files = source_files(slug, sha)
    file_rows, contains, imports = [], [], []
    hits = 0
    for path in files:
        text = read_file(slug, sha, path)
        if text is None:
            continue
        fkey = f"file:{slug}:{path}"
        lang = "typescript" if path.endswith((".ts", ".tsx", ".mts", ".cts")) else "javascript"
        file_rows.append({"key": fkey, "path": path, "language": lang})
        contains.append({"src": f"svc:{slug}", "dst": fkey})
        seen: set[str] = set()
        for name, line in imports_in(text):
            if name in packages and name not in seen:
                seen.add(name)
                imports.append({"src": fkey, "dst": f"pkg:npm/{name}", "line": line})
                hits += 1
    return {
        "files": file_rows,
        "contains": contains,
        "imports": imports,
        "scanned": len(file_rows),
        "hits": hits,
    }


if __name__ == "__main__":
    # regex sanity, then one real repo
    txt = """
    import chalk from 'chalk';
    import { x } from "@tanstack/router-core/dist/foo";
    const d = require('debug')('app');
    import './local'; import fs from 'node:fs';
    export * from 'ansi-styles';
    const m = await import('supports-color');
    """
    got = imports_in(txt)
    assert [n for n, _ in got] == [
        "chalk",
        "@tanstack/router-core",
        "debug",
        "ansi-styles",
        "supports-color",
    ], got
    r = scan_service("socketio/socket.io", "main", {"debug", "chalk"})
    assert r["scanned"] > 20, r["scanned"]
    assert any(i["dst"] == "pkg:npm/debug" for i in r["imports"]), "socket.io imports debug"
    print(
        f"reach ok: socket.io scanned={r['scanned']} import-hits={r['hits']} "
        f"first={r['imports'][0]['src'].split(':', 2)[-1]}:{r['imports'][0]['line']}"
    )
