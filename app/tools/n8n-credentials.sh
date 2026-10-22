#!/usr/bin/env bash
# Moves the n8n credentials (API keys) between n8n instances in Docker, still encrypted with N8N_ENCRYPTION_KEY:
# the file is useless without that key, and the receiving n8n must use the same key.
#   tools/n8n-credentials.sh export n8n-credentials.json     # on this machine
#   tools/n8n-credentials.sh import n8n-credentials.json     # on the server
# Then load the workflows with tools/deploy-workflows.sh and restart n8n.
set -euo pipefail
cd "$(dirname "$0")/.."
# Git Bash on Windows would rewrite container paths such as /tmp/x into Windows paths
export MSYS_NO_PATHCONV=1
# On the server (where .env.prod exists) use the production stack
if [ -z "${COMPOSE_FILE:-}" ] && [ -f .env.prod ]; then export COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILES=.env.prod; fi
cmd="${1:-}"; file="${2:-n8n-credentials.json}"
case "$cmd" in
  export)
    docker compose exec -T n8n n8n export:credentials --all --output=/tmp/credentials.json >/dev/null
    docker compose cp n8n:/tmp/credentials.json "$file"
    docker compose exec -T n8n rm -f /tmp/credentials.json
    echo "Wrote $file (encrypted). Do not commit it." ;;
  import)
    docker compose cp "$file" n8n:/tmp/credentials.json
    docker compose exec -T n8n n8n import:credentials --input=/tmp/credentials.json
    docker compose exec -T n8n rm -f /tmp/credentials.json ;;
  *) echo "usage: $0 export|import [file]"; exit 1 ;;
esac
