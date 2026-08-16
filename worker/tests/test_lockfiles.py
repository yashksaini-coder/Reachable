"""Pure parser tests for the supported lockfile formats: npm v2/v3, pnpm v6/v9. No node."""

import json

from reachable.sources.github import parse_any, parse_lockfile, parse_pnpm_lock

PNPM_V6 = """\
lockfileVersion: '6.0'

dependencies:
  chalk:
    specifier: ^5.3.0
    version: 5.3.0
  react-dom:
    specifier: ^18.2.0
    version: 18.2.0(react@18.2.0)

devDependencies:
  string-width-cjs:
    specifier: npm:string-width@^4.2.0
    version: /string-width@4.2.3

packages:

  /chalk@5.3.0:
    resolution: {integrity: sha512-x}
    dev: false

  /react@18.2.0:
    resolution: {integrity: sha512-x}
    dependencies:
      loose-envify: 1.4.0
    dev: false

  /react-dom@18.2.0(react@18.2.0):
    resolution: {integrity: sha512-x}
    peerDependencies:
      react: ^18.2.0
    dependencies:
      loose-envify: 1.4.0
      react: 18.2.0
      scheduler: 0.23.0
    dev: false

  /loose-envify@1.4.0:
    resolution: {integrity: sha512-x}
    dependencies:
      js-tokens: 4.0.0
    dev: false

  /js-tokens@4.0.0:
    resolution: {integrity: sha512-x}
    dev: false

  /scheduler@0.23.0:
    resolution: {integrity: sha512-x}
    dependencies:
      loose-envify: 1.4.0
    dev: false

  /string-width@4.2.3:
    resolution: {integrity: sha512-x}
    dependencies:
      strip-ansi: 6.0.1
    dev: true

  /strip-ansi@6.0.1:
    resolution: {integrity: sha512-x}
    dev: true

  /local-thing@1.0.0:
    resolution: {directory: packages/x, type: directory}
    dependencies:
      nope: link:../nope
"""

PNPM_V9 = """\
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true

importers:

  .:
    dependencies:
      chalk:
        specifier: ^5.3.0
        version: 5.3.0
      react-dom:
        specifier: ^18.2.0
        version: 18.2.0(react@18.2.0)
    devDependencies:
      string-width-cjs:
        specifier: npm:string-width@^4.2.0
        version: string-width@4.2.3

packages:

  chalk@5.3.0:
    resolution: {integrity: sha512-x}
    engines: {node: ^12.17.0 || ^14.13 || >=16.0.0}

  react@18.2.0:
    resolution: {integrity: sha512-x}

  react-dom@18.2.0:
    resolution: {integrity: sha512-x}
    peerDependencies:
      react: ^18.2.0

  loose-envify@1.4.0:
    resolution: {integrity: sha512-x}

  js-tokens@4.0.0:
    resolution: {integrity: sha512-x}

  scheduler@0.23.0:
    resolution: {integrity: sha512-x}

  string-width@4.2.3:
    resolution: {integrity: sha512-x}

  strip-ansi@6.0.1:
    resolution: {integrity: sha512-x}

snapshots:

  chalk@5.3.0: {}

  react@18.2.0:
    dependencies:
      loose-envify: 1.4.0

  react-dom@18.2.0(react@18.2.0):
    dependencies:
      loose-envify: 1.4.0
      react: 18.2.0
      scheduler: 0.23.0

  loose-envify@1.4.0:
    dependencies:
      js-tokens: 4.0.0

  js-tokens@4.0.0: {}

  scheduler@0.23.0:
    dependencies:
      loose-envify: 1.4.0

  string-width@4.2.3:
    dependencies:
      strip-ansi: 6.0.1

  strip-ansi@6.0.1: {}
"""

NPM_V2 = {
    "name": "app",
    "lockfileVersion": 2,
    "requires": True,
    "packages": {
        "": {"name": "app", "dependencies": {"chalk": "^5.3.0", "react-dom": "^18.2.0"}},
        "node_modules/chalk": {"version": "5.3.0"},
        "node_modules/react": {"version": "18.2.0", "dependencies": {"loose-envify": "^1.1.0"}},
        "node_modules/react-dom": {
            "version": "18.2.0",
            "dependencies": {"loose-envify": "^1.1.0", "scheduler": "^0.23.0"},
            "peerDependencies": {"react": "^18.2.0"},
        },
        "node_modules/loose-envify": {
            "version": "1.4.0",
            "dependencies": {"js-tokens": "^3.0.0 || ^4.0.0"},
        },
        "node_modules/js-tokens": {"version": "4.0.0"},
        "node_modules/scheduler": {"version": "0.23.0", "dependencies": {"loose-envify": "^1.1.0"}},
    },
    "dependencies": {"chalk": {"version": "5.3.0"}},  # legacy v1 section, ignored
}

EXPECT_PKGS = {
    ("chalk", "5.3.0"),
    ("react", "18.2.0"),
    ("react-dom", "18.2.0"),
    ("loose-envify", "1.4.0"),
    ("js-tokens", "4.0.0"),
    ("scheduler", "0.23.0"),
}
EXPECT_EDGES = {
    ("react", "18.2.0", "loose-envify", "1.4.0"),
    ("react-dom", "18.2.0", "loose-envify", "1.4.0"),
    ("react-dom", "18.2.0", "scheduler", "0.23.0"),
    ("loose-envify", "1.4.0", "js-tokens", "4.0.0"),
    ("scheduler", "0.23.0", "loose-envify", "1.4.0"),
}


def _edges(p):
    return {(n, v, dn, dv) for n, v, dn, dv, _ in p["edges"]}


def test_pnpm_v6():
    p = parse_pnpm_lock(PNPM_V6)
    assert p is not None
    assert EXPECT_PKGS <= set(p["packages"])
    assert ("string-width", "4.2.3") in p["packages"]
    assert ("nope", "link:../nope") not in p["packages"]
    # peer suffix stripped from the key; react-dom depends on react + edge via peers key
    assert EXPECT_EDGES | {("react-dom", "18.2.0", "react", "18.2.0")} <= _edges(p)
    assert ("string-width", "4.2.3", "strip-ansi", "6.0.1") in _edges(p)
    assert p["root_deps"] == {"chalk", "react-dom", "string-width-cjs"}
    assert p["unresolved"] == 1  # link:../nope
    assert all(rng is None for *_, rng in p["edges"])


def test_pnpm_v9():
    p = parse_pnpm_lock(PNPM_V9)
    assert p is not None
    assert EXPECT_PKGS | {("string-width", "4.2.3"), ("strip-ansi", "6.0.1")} <= set(p["packages"])
    assert EXPECT_EDGES | {("react-dom", "18.2.0", "react", "18.2.0")} <= _edges(p)
    assert p["root_deps"] == {"chalk", "react-dom", "string-width-cjs"}
    assert p["unresolved"] == 0


def test_pnpm_v5_rejected():
    assert (
        parse_pnpm_lock("lockfileVersion: 5.4\npackages:\n  /chalk/5.3.0:\n    dev: false\n")
        is None
    )


def test_npm_v2():
    p = parse_lockfile(NPM_V2)
    assert p is not None
    assert set(p["packages"]) == EXPECT_PKGS
    assert _edges(p) == EXPECT_EDGES | {("react-dom", "18.2.0", "react", "18.2.0")}
    assert p["root_deps"] == {"chalk", "react-dom"}
    # ranges kept verbatim for npm
    assert ("react", "18.2.0", "loose-envify", "1.4.0", "^1.1.0") in p["edges"]


def test_npm_v1_rejected_and_dispatch():
    assert parse_lockfile({"lockfileVersion": 1, "dependencies": {}}) is None
    assert parse_any(json.dumps(NPM_V2), "package-lock.json") is not None
    assert parse_any(PNPM_V9, "pnpm-lock.yaml") is not None
    assert parse_any("not json", "package-lock.json") is None
