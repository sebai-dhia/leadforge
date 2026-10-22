#!/usr/bin/env bash
# Dumps both databases (the app and n8n) into app/backups, keeps 7 days there and, when BACKUP_REMOTE is set in
# .env.prod (an rclone remote such as gdrive:leadforge-backups), copies them there and keeps 30 days.
#   deploy/backup.sh            # by hand, by deploy.sh before every deploy, and nightly from cron
# Restore: see DEPLOY.md. .env.prod is not backed up: keep a copy of it in your password manager.
set -euo pipefail
cd "$(dirname "$0")/.."
export COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILES=.env.prod
remote="$(grep -E '^BACKUP_REMOTE=' .env.prod | cut -d= -f2- || true)"

mkdir -p backups
ts="$(date +%Y%m%d-%H%M%S)"
dump() {  # service, user, database
  local file="backups/$3-$ts.dump"
  docker compose exec -T "$1" pg_dump -U "$2" -Fc "$3" > "$file"
  # a dump that failed half way is small: stop rather than keep it as the latest backup
  [ "$(stat -c %s "$file")" -gt 1000 ] || { rm -f "$file"; echo "Backup of $3 failed"; exit 1; }
  echo "Wrote $file"
}
dump db leadfinder leadfinder
dump n8n-db n8n n8n

find backups -name '*.dump' -mtime +7 -delete

if [ -n "$remote" ]; then
  rclone copy backups "$remote" --include '*.dump'
  rclone delete "$remote" --min-age 30d --include '*.dump'
  echo "Copied to $remote"
fi
