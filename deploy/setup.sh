#!/usr/bin/env bash
# One-shot setup on a fresh Ubuntu 24.04 host (2 vCPU / 2 GB is enough to serve the graph;
# 4 GB is more comfortable while ingesting). Run as root:
#   curl -fsSL https://raw.githubusercontent.com/yashksaini-coder/Reachable/master/deploy/setup.sh | bash
set -euo pipefail
apt-get update -y && apt-get install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Swap. Serving needs ~735 MB (measured); the ingest peak is not measured and once cost 9 GB.
# On a 2 GB host this is what keeps a spike from killing the graph node.
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 && grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi
git clone https://github.com/yashksaini-coder/Reachable.git /opt/reachable || (cd /opt/reachable && git pull)
cd /opt/reachable/deploy
mkdir -p data/store data/cache && chown -R 1000:1000 data
if [ ! -f .env ]; then
  cp .env.example .env
  KEY=$(openssl rand -hex 24); TOK=$(openssl rand -hex 24); IP=$(curl -s https://api.ipify.org)
  sed -i "s/^HYDRA_TOKEN=.*/HYDRA_TOKEN=$TOK/; s/^REACHABLE_API_KEY=.*/REACHABLE_API_KEY=$KEY/; s/^API_HOST=.*/API_HOST=api.$IP.sslip.io/" .env
  chmod 600 .env   # three secrets live here; keep it out of reach of other local accounts
  echo ">>> edit /opt/reachable/deploy/.env and set GITHUB_TOKEN, then re-run this script (or: docker compose up -d --build)"
  exit 0
fi
printf '%s\n' "$(grep ^HYDRA_TOKEN= .env | cut -d= -f2-)" > data/auth-token && chown 1000:1000 data/auth-token
docker compose up -d --build
echo ">>> API: https://$(grep ^API_HOST= .env | cut -d= -f2-)/health"
# Never echo the key: this output lands in terminal scrollback, CI logs and transcripts. Print the
# command that reads it instead, so the value is disclosed only when someone deliberately asks.
echo ">>> On Vercel set REACHABLE_API_URL=https://$(grep ^API_HOST= .env | cut -d= -f2-)"
echo ">>> and REACHABLE_API_KEY — read it with: sudo grep ^REACHABLE_API_KEY= $PWD/.env | cut -d= -f2-"
