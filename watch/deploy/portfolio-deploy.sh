#!/bin/bash
set -euo pipefail
exec 8>/run/lock/portfolio-deploy.lock
flock -n 8 || exit 0
cd /opt/portfolio
git pull --ff-only origin main --quiet
if [ -f /opt/watch-together/auto-deploy.enabled ] && [ -f watch/deploy/update-vps.sh ]; then
    bash watch/deploy/update-vps.sh
fi
