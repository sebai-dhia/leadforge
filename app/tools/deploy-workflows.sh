#!/usr/bin/env bash
# Builds the three workflows from build-*.js and loads them into n8n, replacing the live versions.
# Works with n8n in Docker (docker compose service "n8n") or with tools/n8n-local.sh.
# n8n reads published workflows at startup: restart it afterwards, then run one throwaway search.
set -euo pipefail
cd "$(dirname "$0")/.."

node build-workflow.js
node build-enrich-workflow.js
node build-draft-workflow.js

FILES=(lead-finder.workflow.json enrich-contact.workflow.json draft-message.workflow.json)
IDS=$(node -e "for (const f of process.argv.slice(1)) console.log(require('./n8n/' + f).id)" "${FILES[@]}")

if [ -n "$(docker compose ps -q n8n 2>/dev/null)" ]; then
  run() { docker compose exec -T n8n n8n "$@"; }
  dir=/workflows
  restart="docker compose restart n8n"
else
  run() { tools/n8n-local.sh "$@"; }
  dir="$(pwd)/n8n"
  restart="stop tools/n8n-local.sh and start it again"
fi

# an active workflow cannot be replaced: unpublish, import, publish again
for id in $IDS; do run unpublish:workflow --id="$id" || true; done
for f in "${FILES[@]}"; do run import:workflow --input="$dir/$f"; done
for id in $IDS; do run publish:workflow --id="$id"; done

echo
echo "Workflows loaded. Now: $restart, then run one search before trusting results."
