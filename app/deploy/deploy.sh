#!/usr/bin/env bash
# Deploys a version on the server: backs up both databases, checks out the version, rebuilds what changed,
# reloads the n8n workflows when they changed, then waits until the site answers.
#   deploy/deploy.sh             # the latest main from GitHub
#   deploy/deploy.sh v0.1.0      # a tag or commit, also to roll back (restore a backup first if that version
#                                # is older than a database migration, see DEPLOY.md)
set -euo pipefail
# The braces make bash read the whole script before running it: the checkout below can replace this file.
{
cd "$(dirname "$0")/.."
[ -f .env.prod ] || { echo "No .env.prod here: copy .env.prod.example and fill it in"; exit 1; }
export COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILES=.env.prod
domain="$(grep -E '^DOMAIN=' .env.prod | cut -d= -f2-)"
ref="${1:-origin/main}"

# the first deploy has no database to back up yet
if [ -n "$(docker compose ps -q --status running db 2>/dev/null)" ]; then
  deploy/backup.sh
fi

before="$(git rev-parse HEAD)"
git fetch origin --tags --quiet
git checkout --quiet --detach "$ref"
after="$(git rev-parse HEAD)"
echo "Deploying $(git log -1 --format='%h %s') (was ${before:0:7})"

docker compose up -d --build --remove-orphans

# n8n reads published workflows at startup: reload them only when they changed (or on the first deploy)
if [ "$before" = "$after" ] || ! git diff --quiet "$before" "$after" -- n8n/; then
  echo "Loading the n8n workflows"
  tools/deploy-workflows.sh
  docker compose restart n8n
fi

echo -n "Waiting for https://$domain "
for _ in $(seq 60); do
  if curl -fsS -o /dev/null --resolve "$domain:443:127.0.0.1" "https://$domain/api/auth/demo-status"; then
    echo " up."
    docker image prune -f >/dev/null
    echo "Deployed $(git describe --tags --always). Run one search before trusting results."
    exit 0
  fi
  echo -n "."; sleep 3
done
echo
echo "The site did not answer within 3 minutes. Look at: docker compose logs --tail 100 backend web"
echo "To go back: deploy/deploy.sh ${before:0:7}"
exit 1
}
