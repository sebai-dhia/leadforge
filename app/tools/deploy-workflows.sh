#!/usr/bin/env bash
# Builds the three workflows from build-*.js and loads them into n8n, replacing the live versions.
# Works with n8n in Docker (docker compose service "n8n") or with tools/n8n-local.sh.
# n8n reads published workflows at startup: restart it afterwards, then run one throwaway search.
set -euo pipefail
cd "$(dirname "$0")/.."
# Git Bash on Windows would rewrite container paths such as /tmp/x into Windows paths
export MSYS_NO_PATHCONV=1
# On the server (where .env.prod exists) use the production stack
if [ -z "${COMPOSE_FILE:-}" ] && [ -f .env.prod ]; then export COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILES=.env.prod; fi

# rebuild when Node is available (on your machine); a server uses the JSON files committed with the code
if command -v node >/dev/null; then
  node build-workflow.js
  node build-enrich-workflow.js
  node build-draft-workflow.js
fi

FILES=(lead-finder.workflow.json enrich-contact.workflow.json draft-message.workflow.json)
IDS=$(for f in "${FILES[@]}"; do grep -Eo '"id": "[A-Za-z0-9]{16}"' "n8n/$f" | tail -1 | cut -d'"' -f4; done)

if [ -n "$(docker compose ps -q n8n 2>/dev/null)" ]; then
  run() { docker compose exec -T n8n n8n "$@"; }
  dir=/workflows
  restart="docker compose restart n8n"
else
  run() { tools/n8n-local.sh "$@"; }
  dir="$(pwd -W 2>/dev/null || pwd)/n8n"
  restart="stop tools/n8n-local.sh and start it again"
fi

# an active workflow cannot be replaced: unpublish, import, publish again
for id in $IDS; do run unpublish:workflow --id="$id" || true; done
for f in "${FILES[@]}"; do run import:workflow --input="$dir/$f"; done
for id in $IDS; do run publish:workflow --id="$id"; done

echo
echo "Workflows loaded. Now: $restart, then run one search before trusting results."
