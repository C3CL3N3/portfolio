#!/bin/bash
# Invoked after the portfolio's successful git pull. Install at the existing VPS paths.
set -euo pipefail
exec 9>/run/lock/watch-together-deploy.lock
flock -n 9 || exit 0
base=/opt/watch-together
repo=/opt/portfolio
test -f "$base/auto-deploy.enabled" || exit 0
export PATH="$base/runtime/bin:$PATH"
cd "$repo"
revision=$(git rev-parse HEAD)
tree=$(git rev-parse HEAD:watch)
if [ -f "$base/site/.watch-tree" ] && [ "$(cat "$base/site/.watch-tree")" = "$tree" ]; then exit 0; fi
release="$base/releases/$(date -u +%Y%m%dT%H%M%S)-$revision"
mkdir -p "$release"
git archive HEAD watch | tar -x -C "$release" --strip-components=1
cd "$release/backend"
npm ci --omit=dev --cache "$base/npm-cache" --no-audit --no-fund
npm run check
npm test
printf '%s\n' "$tree" > "$release/.watch-tree"
printf '%s\n' "$revision" > "$release/.git-revision"
# Keep the initial directory and all earlier releases for rollback.
if [ -L "$base/site" ]; then
    previous=$(readlink -f "$base/site")
else
    previous="$base/backup/site-before-autodeploy"
    test ! -e "$previous"
    mv "$base/site" "$previous"
fi
ln -s "$release" "$base/site.next"
mv -Tf "$base/site.next" "$base/site"
healthy() {
    for attempt in {1..10}; do
        if curl -fsS --max-time 2 http://127.0.0.1:3000/watch/ -o /dev/null 2>/dev/null; then return 0; fi
        sleep 1
    done
    return 1
}
if ! systemctl restart watch-together.service || ! healthy; then
    ln -s "$previous" "$base/site.rollback"
    mv -Tf "$base/site.rollback" "$base/site"
    systemctl restart watch-together.service
    echo 'Watch deployment failed; restored previous release.' >&2
    exit 1
fi
printf '%s\n' "$previous" > "$base/previous-release"
echo "Watch deployed $revision"
