#!/usr/bin/env bash
# One-shot setup on a fresh Ubuntu 24.04 droplet (2 vCPU / 4 GB is plenty). Run as root:
#   curl -fsSL https://raw.githubusercontent.com/yashksaini-coder/Reachable/master/deploy/setup.sh | bash
set -euo pipefail
apt-get update -y && apt-get install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
git clone https://github.com/yashksaini-coder/Reachable.git /opt/reachable || (cd /opt/reachable && git pull)
cd /opt/reachable/deploy
mkdir -p data/store data/cache && chown -R 1000:1000 data
if [ ! -f .env ]; then
  cp .env.example .env
  KEY=$(openssl rand -hex 24); TOK=$(openssl rand -hex 24); IP=$(curl -s https://api.ipify.org)
  sed -i "s/^HYDRA_TOKEN=.*/HYDRA_TOKEN=$TOK/; s/^REACHABLE_API_KEY=.*/REACHABLE_API_KEY=$KEY/; s/^API_HOST=.*/API_HOST=api.$IP.sslip.io/" .env
  echo ">>> edit /opt/reachable/deploy/.env and set GITHUB_TOKEN, then re-run this script (or: docker compose up -d --build)"
  exit 0
fi
printf '%s\n' "$(grep ^HYDRA_TOKEN= .env | cut -d= -f2-)" > data/auth-token && chown 1000:1000 data/auth-token
docker compose up -d --build
echo ">>> API: https://$(grep ^API_HOST= .env | cut -d= -f2-)/health"
echo ">>> On Vercel set REACHABLE_API_URL=https://$(grep ^API_HOST= .env | cut -d= -f2-) and REACHABLE_API_KEY=$(grep ^REACHABLE_API_KEY= .env | cut -d= -f2-) then redeploy."
