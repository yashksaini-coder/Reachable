"""Read KEY=VALUE lines from the nearest .env into os.environ.

Its own module because importing reachable.db for it evaluates `TOKEN = token()`, which raises
without HYDRA_TOKEN — fatal for the MCP relay, which never opens a Bolt session.
"""

from __future__ import annotations

import os
from pathlib import Path


def load_dotenv() -> None:
    """Nearest .env wins; never overrides anything already in the environment. Stdlib only.
    The node (make node) reads the same file, so they agree."""
    for parent in (Path.cwd(), *Path(__file__).resolve().parents):
        f = parent / ".env"
        if f.is_file():
            for line in f.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            return
