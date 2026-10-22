#!/bin/sh
# Starts the three parts of the app in one container (deploy/hf/Dockerfile): Caddy and the backend first, then n8n
# once the backend answers (they would slow each other down on the Space's 2 CPUs). When one of them stops, the
# container stops and the Space restarts it.
set -eu

for name in DB_URL DB_USER DB_PASSWORD JWT_SECRET ADMIN_PASSWORD N8N_WEBHOOK_SECRET N8N_CALLBACK_SECRET \
            N8N_ENCRYPTION_KEY DB_POSTGRESDB_HOST DB_POSTGRESDB_USER DB_POSTGRESDB_PASSWORD CORS_ORIGIN; do
  eval "[ -n \"\${$name:-}\" ]" || { echo "Missing setting $name (add it in the Space settings)"; exit 1; }
done

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
web=$!

# app.jsa is the class archive made during the build (faster start); -Xshare:auto ignores it if it does not fit
/opt/java/openjdk/bin/java -Xmx1g -XX:SharedArchiveFile=/app/app.jsa -Xshare:auto -jar /app/app.jar &
api=$!

started=$(date +%s)
until node -e "fetch('http://127.0.0.1:8081/api/auth/demo-status').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"; do
  kill -0 "$api" 2>/dev/null || { echo "The backend stopped"; kill "$web"; exit 1; }
  sleep 2
done
echo "Backend ready in $(( $(date +%s) - started )) s; starting n8n"

# n8n gets none of the backend's secrets
n8n() {
  env -u DB_URL -u DB_USER -u DB_PASSWORD -u JWT_SECRET -u ADMIN_PASSWORD -u TELEGRAM_BOT_TOKEN \
      -u N8N_CREDENTIALS -u GITHUB_TOKEN /usr/local/bin/n8n "$@"
}
# The credentials (an n8n export, still encrypted with N8N_ENCRYPTION_KEY) and the workflows are loaded at every
# start, so the Space needs no n8n editor. An active workflow cannot be replaced: unpublish, import, publish again.
if [ -n "${N8N_CREDENTIALS:-}" ]; then
  printf '%s' "$N8N_CREDENTIALS" > /tmp/credentials.json
  n8n import:credentials --input=/tmp/credentials.json
  rm -f /tmp/credentials.json
fi
ids=""
for f in /workflows/*.json; do
  ids="$ids $(grep -Eo '"id": "[A-Za-z0-9]{16}"' "$f" | tail -1 | cut -d'"' -f4)"
done
for id in $ids; do n8n unpublish:workflow --id="$id" >/dev/null 2>&1 || true; done
n8n import:workflow --separate --input=/workflows
for id in $ids; do n8n publish:workflow --id="$id"; done

n8n start &
flows=$!
echo "n8n starting, $(( $(date +%s) - started )) s after the backend"

while kill -0 "$web" 2>/dev/null && kill -0 "$api" 2>/dev/null && kill -0 "$flows" 2>/dev/null; do
  sleep 5
done
echo "A part of the app stopped; stopping the container"
kill "$web" "$api" "$flows" 2>/dev/null || true
exit 1
