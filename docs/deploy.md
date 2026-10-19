# Deploying Leadforge

Everything runs on one Linux server with Docker: `app/docker-compose.prod.yml`.

| Service | What it is | Reachable from |
|---|---|---|
| `web` | Caddy: serves the web app, forwards `/api` to the backend, gets and renews the HTTPS certificate | the internet (80, 443) |
| `backend` | Spring Boot API | only `web` and `n8n` |
| `db` | Postgres for the app | only `backend` |
| `n8n` | the three workflows (find leads, contact lookup, draft message) | only `backend`; editor through an SSH tunnel |
| `n8n-db` | Postgres for n8n | only `n8n` |

## Server

Any Linux machine with 2 GB RAM or more, Docker and a public IP. A DNS name (`DOMAIN`) must point at it, and ports 80 and 443 must be open.

## First deployment

1. Copy the repository to the server and go to `app/`.
2. `cp .env.prod.example .env.prod` and fill in every value. Use `openssl rand -hex 24` for each secret. Keep `N8N_ENCRYPTION_KEY` equal to the one in your local `app/.env` so the credentials you move stay readable.
3. Start: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`
4. Move the n8n credentials (the API keys), encrypted:
   - on your machine: `tools/n8n-credentials.sh export n8n-credentials.json`, then copy the file to the server's `app/`
   - on the server: `COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILES=.env.prod tools/n8n-credentials.sh import n8n-credentials.json`, then delete the file
5. Load the workflows: `COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILES=.env.prod tools/deploy-workflows.sh`, then `docker compose -f docker-compose.prod.yml --env-file .env.prod restart n8n`.
6. Open n8n through a tunnel (`ssh -L 5678:localhost:5678 you@server`, then http://localhost:5678), create its owner account, and set the two shared secrets in its credentials: **Header Auth account** (`X-Webhook-Secret`) = `N8N_WEBHOOK_SECRET`, **Header Auth account 2** (`X-Callback-Secret`) = `N8N_CALLBACK_SECRET`.
7. In Google Cloud, add `https://DOMAIN` to the OAuth client's authorised JavaScript origins.
8. Run one search as the admin. The first search after an n8n restart can still use an older workflow version; the second one counts.

## Updating

- App code: `git pull`, then `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`
- Workflows: step 5 above
- Backups: the volumes `leadforge_pgdata` and `leadforge_n8n_pgdata` hold all data, for example `docker compose -f docker-compose.prod.yml --env-file .env.prod exec db pg_dump -U leadfinder leadfinder > backup.sql`

## Security notes

- Only Caddy is public. n8n listens on the server's loopback address only.
- `/api/internal/*` (n8n's callback) is blocked at Caddy; n8n reaches the backend inside Docker.
- Secrets live in `.env.prod` on the server and in n8n's encrypted credentials, never in the repository.
- The backend reads the visitor's address from Caddy, so the per-address limits on guests and failed logins work.
