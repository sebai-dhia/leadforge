#!/usr/bin/env bash
# Runs n8n on this machine (outside Docker) with its data in the n8n-db Postgres from docker-compose.
# Use it when Docker cannot run the n8n image; on a server, `docker compose up -d` runs n8n itself.
#   tools/n8n-local.sh            start n8n
#   tools/n8n-local.sh <command>  run an n8n CLI command against the same database (import:workflow, publish:workflow ...)
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "app/.env is missing (copy .env.example)"; exit 1; }
set -a; . ./.env; set +a
: "${N8N_ENCRYPTION_KEY:?set N8N_ENCRYPTION_KEY in app/.env}"

docker compose up -d n8n-db >/dev/null

export DB_TYPE=postgresdb
export DB_POSTGRESDB_HOST=127.0.0.1
export DB_POSTGRESDB_PORT=5434
export DB_POSTGRESDB_DATABASE=n8n
export DB_POSTGRESDB_USER=n8n
export DB_POSTGRESDB_PASSWORD="${N8N_DB_PASSWORD:-n8n-local-only}"
# Docker Desktop port forwarding can be slow to open connections; the default 20 s is not always enough at startup
export DB_POSTGRESDB_CONNECTION_TIMEOUT=60000 DB_POSTGRESDB_POOL_SIZE=4
export N8N_ENCRYPTION_KEY
export WEBHOOK_URL="${N8N_WEBHOOK_BASE:-http://localhost:5678/}"
export N8N_SECURE_COOKIE="${N8N_SECURE_COOKIE:-false}"
export GENERIC_TIMEZONE=Africa/Tunis TZ=Africa/Tunis
export N8N_DIAGNOSTICS_ENABLED=false N8N_PERSONALIZATION_ENABLED=false N8N_BLOCK_ENV_ACCESS_IN_NODE=true
export EXECUTIONS_DATA_PRUNE=true EXECUTIONS_DATA_MAX_AGE=336
# keep this instance's settings apart from the old SQLite one in ~/.n8n
export N8N_USER_FOLDER="${N8N_USER_FOLDER:-$HOME/.n8n-leadforge}"

N8N_BIN="${N8N_BIN:-npx --yes n8n@2.43.8}"
if [ $# -eq 0 ]; then exec $N8N_BIN start; else exec $N8N_BIN "$@"; fi
