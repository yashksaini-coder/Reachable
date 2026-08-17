#!/bin/sh
# wait for the node's Bolt port (the image has no curl for a compose healthcheck), then run the API
set -e
python - <<'PY'
import os, socket, time, urllib.parse
u = urllib.parse.urlparse(os.environ.get("HYDRA_URI", "bolt://hydradb:7687"))
for i in range(120):
    try:
        socket.create_connection((u.hostname, u.port or 7687), 2).close(); break
    except OSError:
        time.sleep(2)
else:
    raise SystemExit("hydradb did not come up on " + u.netloc)
PY
exec python -u -m reachable.api
