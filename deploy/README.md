# Deploying the worker + HydraDB (any Ubuntu VM)

The console on Vercel renders committed reports with no worker at all; **Services, Ask, Graph and
Beyond-the-watched-set stay in their degraded states until a worker is reachable**. One small VM runs
the whole live side: the HydraDB node, the worker (ingest jobs + query API) and Caddy for HTTPS.

Verified on AWS EC2 `t4g.small` (2 vCPU / 2 GB, Graviton/arm64, ap-south-1) on 2026-08-19. Nothing
here is AWS-specific — any Ubuntu 24.04 host with Docker works.

## Sizing — measured, not estimated

| | figure |
|---|---|
| graph node, serving | ~660 MB RSS (13-service graph, dev box) |
| worker, idle | ~75 MB |
| **whole box while serving** | **877 MB of 1836 MB used, 959 MB available, swap untouched** (t4g.small, 15-service graph, all three containers) |
| store on disk | 655 MB (684,943,472 bytes / 531 files) |
| worker image | 340 MB, built natively on arm64 |
| `/health` | 249 ms first call, **6.99 ms warm** |

**2 GB is enough to serve.** Ingest is the unmeasured part — `pipeline.py:160` records that holding
packuments once cost 9 GB RSS before they were streamed, and the packument LRU (`npm.py:31`,
`maxsize=4096`) has no byte ceiling. Two controls bound it rather than a bigger box: `setup.sh`
adds a 4 GB swapfile, and `docker-compose.yml` caps the worker (`mem_limit: 1g`) so a runaway
ingest kills the worker — job marked failed, retry button already in the UI — instead of the graph
node, which would take the console down.

**arm64 works.** The HydraDB image is multi-arch, the worker image builds natively, and a store
written by an x86_64 node **opens unchanged on arm64** (verified by running the arm64 node against a
copy of this store and reading back all six label counts). Graviton is roughly half the hourly cost
of the x86 equivalent.

Cost as deployed: instance $0.0112/hr + 20 GB gp3 $0.0912/GB-month + public IPv4 $0.005/hr ≈
**$13.65/month**. The IPv4 address bills whether or not the instance is running.

## 1. Host

Ubuntu 24.04, 2 vCPU / 2 GB, 20 GB disk, a region near your Vercel functions (`bom1` → `ap-south-1`).
Inbound **22, 80, 443 only** — 80 is required for the ACME challenge, and the node's Bolt/HTTP/admin
ports are never published to the host. On a cloud with its own firewall (an EC2 security group),
that is the real control; `ufw` inside the box cannot restrict Docker-published ports.

On a burstable instance type (`t3`/`t4g`), launch with **standard** CPU credits, not the `unlimited`
default — unlimited silently bills for sustained CPU above baseline, which one long ingest triggers.

## 2. One-shot setup

```bash
# as root; on EC2 you are 'ubuntu', so pipe to sudo
curl -fsSL https://raw.githubusercontent.com/yashksaini-coder/Reachable/master/deploy/setup.sh | sudo bash
# first run installs Docker, adds swap, clones to /opt/reachable, writes deploy/.env with a random
# HYDRA_TOKEN and REACHABLE_API_KEY and API_HOST=api.<ip>.sslip.io, then stops.
sudo nano /opt/reachable/deploy/.env        # replace the GITHUB_TOKEN placeholder
```

**Load the data before the second run** (§3) — the second run starts the node, and a node started
against an empty directory creates an empty graph you would then have to overwrite underneath it.

```bash
curl -fsSL https://raw.githubusercontent.com/yashksaini-coder/Reachable/master/deploy/setup.sh | sudo bash
# second run: writes data/auth-token, builds the worker image, starts hydradb · worker · caddy
```

If you allocate a static IP, attach it **before** the first run: `setup.sh` derives `API_HOST` from
the address the box has at that moment, and the TLS certificate is issued for that hostname.
`API_HOST` is also the MCP transport's allowed host: the SDK refuses a proxied request whose `Host`
it was not told about (HTTP 421), so a wrong value there breaks `/mcp` and nothing else.

## 3. Data

**Copy an existing store (fast, exact).** Do this with the remote stack *not yet started*:

```bash
make node-stop                                        # stop the local node so the store is at rest
rsync -a --info=progress2 --no-inc-recursive \
  .hydradb/store/ ubuntu@<ip>:/opt/reachable/deploy/data/store/
```

The destination must end up owned by uid 1000 (the user the node container runs as); rsyncing as
`ubuntu` on an EC2 Ubuntu host already satisfies that. Verify before starting anything:

```bash
du -sb .hydradb/store | cut -f1 ; find .hydradb/store -type f | wc -l    # compare both sides
```

**Or replay the demo set** (~30 min of real GitHub/npm/OSV traffic, needs `GITHUB_TOKEN`):

```bash
cd /opt/reachable/deploy
sudo docker compose exec worker python -m reachable.jobs --api http://127.0.0.1:8787 koajs/koa
# all of them:
for r in $(grep -vE '^#|^$' /opt/reachable/demo/services.txt | cut -d' ' -f1); do
  sudo docker compose exec worker python -m reachable.jobs --api http://127.0.0.1:8787 $r
done
```

## 4. Point the console at it

Vercel → Project → Settings → Environment Variables → **Production**:

```
REACHABLE_API_URL = https://api.<ip>.sslip.io      # no trailing slash: the proxy builds ${API}${path}
REACHABLE_API_KEY = <read from deploy/.env>
```

Read the key without printing it into scrollback:

```bash
sudo grep ^REACHABLE_API_KEY= /opt/reachable/deploy/.env | cut -d= -f2-
```

Then **redeploy** — environment changes apply to new deployments only, never to the one already
serving:

```bash
npx vercel@latest deploy --prod --yes      # from the repo root, not web/
```

Two things worth knowing:

- The project is **not connected to a Git repository**. Pushing to GitHub does not deploy anything;
  every deploy is the CLI command above, run from the repo root so `worker/out`, `docs` and `demo`
  are included (the project's Root Directory is `web`).
- **Do not set `HYDRA_TOKEN` on Vercel.** The console's `/api/health` pings the node directly when
  that variable exists, and the node has no public port — it would report `down` instead of the
  truthful `unconfigured`.

## 5. Check

```bash
curl https://api.<ip>.sslip.io/health          # {"ok": true, "services": N} — open by design
curl -o /dev/null -w '%{http_code}\n' https://api.<ip>.sslip.io/services      # 401 without the key
curl -H "Authorization: Bearer $REACHABLE_API_KEY" https://api.<ip>.sslip.io/services
```

The check worth keeping is the one that tests the property rather than the setting — the key must
never appear in anything a browser downloads:

```bash
curl -s https://<your-console>/services | grep -c "$REACHABLE_API_KEY"    # 0
```

## 6. Operating it

```bash
cd /opt/reachable/deploy
sudo docker compose logs -f worker
sudo docker compose up -d worker            # after editing .env — see below
cd /opt/reachable && git pull && cd deploy && sudo docker compose up -d --build   # update
```

**A changed `Caddyfile` needs the container recreated, not restarted.** Docker binds a single-file
mount by inode; `git pull` writes a new file and renames over it, so the container keeps the old,
deleted one. It looks like Caddy ignoring its config, and no reload fixes it —
`docker compose up -d --force-recreate caddy`. `setup.sh` passes `--force-recreate` for this reason.

**After editing `.env`, `docker restart` is not enough.** Compose resolves environment variables at
container *creation* and bakes them in; a restart reuses the same container with the same values.
`docker compose up -d` sees the changed config hash and recreates the container, which is what
actually applies the edit.

**Rotating the API key:**

```bash
sudo sh -c 'NEW=$(openssl rand -hex 24); sed -i "s|^REACHABLE_API_KEY=.*|REACHABLE_API_KEY=$NEW|" /opt/reachable/deploy/.env'
cd /opt/reachable/deploy && sudo docker compose up -d worker
# then set the same value in Vercel and redeploy
```

Between the two the console's live features return 401 and show their unavailable states; committed
reports, board and badges are unaffected because they never call the worker.

MCP against the remote worker:
`REACHABLE_API_URL=https://api.<ip>.sslip.io REACHABLE_API_KEY=… make mcp`
