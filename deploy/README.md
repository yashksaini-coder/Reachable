# Deploying the worker + HydraDB (DigitalOcean or any Ubuntu VM)

The console on Vercel is read-only until a worker is reachable. One small VM runs the whole live
side: the HydraDB node, the worker (ingest jobs + query API) and Caddy for HTTPS.

Sizing measured on the dev box: node ~660 MB RAM with the 13-service graph (store 655 MB on disk),
worker ~75 MB idle; ingest of a large repo peaks higher — a **2 vCPU / 4 GB** droplet ($24/mo)
is comfortable, 2 GB works for the demo graph.

## 1. Droplet
Ubuntu 24.04, 4 GB, any region (put it near you or near Vercel's `bom1`). Add your SSH key.

## 2. One-shot setup (as root on the droplet)
```bash
curl -fsSL https://raw.githubusercontent.com/yashksaini-coder/Reachable/master/deploy/setup.sh | bash
# first run writes deploy/.env with random HYDRA_TOKEN / REACHABLE_API_KEY and API_HOST=api.<ip>.sslip.io
nano /opt/reachable/deploy/.env        # set GITHUB_TOKEN
bash /opt/reachable/deploy/setup.sh    # second run: builds and starts hydradb · worker · caddy
```
Ports open: 22, 80, 443 only. Bolt/HTTP/admin of the node stay inside the compose network.

## 3. Data
Either replay the demo set (~30 min, real GitHub/npm/OSV traffic):
```bash
docker compose exec worker sh -c 'python -m reachable.jobs --api http://127.0.0.1:8787 koajs/koa'   # one repo
# or all: for r in $(grep -vE "^#|^$" /opt/reachable/demo/services.txt | cut -d" " -f1); do docker compose exec worker python -m reachable.jobs --api http://127.0.0.1:8787 $r; done
```
or copy an existing store from your machine (fast): stop the node here (`make node-stop`), then
`rsync -az .hydradb/store/ root@<ip>:/opt/reachable/deploy/data/store/` and `docker compose restart hydradb`.

## 4. Point the console at it (Vercel → Project → Settings → Environment Variables, Production)
```
REACHABLE_API_URL = https://api.<ip>.sslip.io
REACHABLE_API_KEY = <the key from deploy/.env>
```
Redeploy (`npx vercel@latest deploy --prod --yes` from the repo root). Services / Ask / Graph /
Beyond-the-watched-set go live; the reports stay static.

## 5. Check
`curl https://api.<ip>.sslip.io/health` → `{"ok": true, "services": N}`. Anything but /health
needs `Authorization: Bearer <REACHABLE_API_KEY>`. Logs: `docker compose logs -f worker`.
Update: `cd /opt/reachable && git pull && cd deploy && docker compose up -d --build`.

MCP from your laptop against the remote worker: `REACHABLE_API_URL=https://api.<ip>.sslip.io REACHABLE_API_KEY=… make mcp`.
