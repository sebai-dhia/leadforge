# Free hosting: Cloudflare Pages + Render + SnapDeploy + Supabase

Costs $0 and needs no bank card. Each part runs where a free plan fits it:

| Part | Where | Awake |
|---|---|---|
| Web app | **Cloudflare Pages** (static files) | always |
| Backend | **Render** free web service (512 MB, 0.1 CPU) | always: a ping every 10 minutes stops it from sleeping |
| n8n | **SnapDeploy** free container (512 MB, 0.25 CPU) | sleeps after about 15 minutes idle; the first search after a pause waits about 2 minutes |
| Databases | **Supabase**, projects `leadforge` and `leadforge-n8n` | always |

Measured with the same limits on a PC: the backend uses about 360 MB and takes about 3 minutes to start, n8n about
335 MB and 2 minutes. Render's 750 free hours a month cover one service awake all month, which is why only the backend
is kept awake: the Telegram bot and the reminders need it.

| File | What it does |
|---|---|
| [`render.yaml`](../../../render.yaml) | The backend on Render (Blueprint): Dockerfile, memory settings, the settings to fill in |
| [`.github/workflows/load-n8n.yml`](../../../.github/workflows/load-n8n.yml) | Loads the n8n credentials and workflows into Supabase, and creates n8n's owner account |
| [`pages-build.mjs`](pages-build.mjs) | Writes the backend's address and the security headers into the built web app |
| [`.github/workflows/backup-db.yml`](../../../.github/workflows/backup-db.yml) | Nightly dumps of both databases |

Keep every value you create in a password manager. Never paste one into a chat or a file in the repository.

## 1. Values you need first

- Supabase `leadforge` and `leadforge-n8n`: session pooler host and user, and each database password.
- `app/.env` on your PC: `N8N_ENCRYPTION_KEY` (copy it as it is), and the two new secrets `N8N_WEBHOOK_SECRET` and
  `N8N_CALLBACK_SECRET` (`openssl rand -hex 24` each), also set in your local n8n credentials "Header Auth account"
  and "Header Auth account 2".
- `app/n8n-credentials.json`: `tools/n8n-credentials.sh export n8n-credentials.json`, with the local stack running.
- A new `JWT_SECRET` (`openssl rand -hex 24`), and an n8n owner email and password (8+ characters, a number, a capital).

## 2. GitHub: load n8n into its database

Repository > Settings > Secrets and variables > Actions > **Secrets**:

| Secret | Value |
|---|---|
| `N8N_DB_HOST` | `leadforge-n8n` pooler host |
| `N8N_DB_USER` | `leadforge-n8n` pooler user (`postgres.xxxx`) |
| `N8N_DB_PASSWORD` | `leadforge-n8n` database password |
| `N8N_ENCRYPTION_KEY` | from `app/.env` |
| `N8N_CREDENTIALS` | the whole content of `n8n-credentials.json` |
| `N8N_OWNER_EMAIL`, `N8N_OWNER_PASSWORD` | n8n's owner account |
| `BACKUP_APP_DB_URL`, `BACKUP_N8N_DB_URL` | `postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require`, one per project |

Then Actions > **Load n8n workflows** > Run workflow. It ends green with "Owner account created". Delete
`n8n-credentials.json` from your PC afterwards.

## 3. SnapDeploy: n8n

Sign up at snapdeploy.dev (no card). New container from the image **`n8nio/n8n:2.43.8`**, port **5678**, with these
environment variables:

| Name | Value |
|---|---|
| `DB_TYPE` | `postgresdb` |
| `DB_POSTGRESDB_HOST`, `DB_POSTGRESDB_USER`, `DB_POSTGRESDB_PASSWORD` | the `leadforge-n8n` values |
| `DB_POSTGRESDB_PORT` / `DB_POSTGRESDB_DATABASE` | `5432` / `postgres` |
| `DB_POSTGRESDB_SSL_ENABLED` / `DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED` | `true` / `false` |
| `N8N_ENCRYPTION_KEY` | from `app/.env` |
| `N8N_DISABLE_UI` | `true` (no editor on the public address) |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `true` |
| `N8N_DIAGNOSTICS_ENABLED`, `N8N_PERSONALIZATION_ENABLED` | `false` |
| `NODE_OPTIONS` | `--max-old-space-size=300` |
| `EXECUTIONS_DATA_PRUNE` / `EXECUTIONS_DATA_MAX_AGE` | `true` / `336` |
| `GENERIC_TIMEZONE`, `TZ` | `Africa/Tunis` |

Note its address (like `https://xxxx.containers.snapdeploy.app`). Check: `<address>/healthz` answers `{"status":"ok"}`.

## 4. Render: the backend

Sign up at render.com with GitHub. **New > Blueprint**, choose this repository: it reads `render.yaml` and asks for
the values marked there:

| Name | Value |
|---|---|
| `DB_URL` | `jdbc:postgresql://<leadforge host>:5432/postgres?sslmode=require` |
| `DB_USER`, `DB_PASSWORD` | the `leadforge` values |
| `JWT_SECRET` | the new secret |
| `CORS_ORIGIN` | the web app's address from step 5, like `https://leadforge.pages.dev` (put a placeholder now, fix it after step 5) |
| `PUBLIC_BASE_URL` | this service's address, `https://leadforge-api.onrender.com` (shown at the top of the service page) |
| `N8N_WEBHOOK_URL` | `<n8n address>/webhook/find-leads` |
| `N8N_DRAFT_URL` | `<n8n address>/webhook/draft-message` |
| `N8N_ENRICH_URL` | `<n8n address>/webhook/enrich-contact` |
| `N8N_WEBHOOK_SECRET`, `N8N_CALLBACK_SECRET` | the two secrets from `app/.env` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | the admin account (password 12+ characters) |
| `GOOGLE_CLIENT_ID` | your OAuth client ID |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | a new bot from @BotFather, and your chat id |

The first build and start take about 10 minutes. Check: `https://leadforge-api.onrender.com/api/auth/demo-status`
answers. If a setting is missing, the log says `Set the environment variable ...`.

## 5. Cloudflare Pages: the web app

Sign up at cloudflare.com (no card). Workers & Pages > Create > **Pages** > Connect to Git > this repository:

| Setting | Value |
|---|---|
| Project name | `leadforge` (gives `leadforge.pages.dev`) |
| Production branch | `main` |
| Root directory | `app/frontend` |
| Build command | `npm ci && npx ng build --configuration production && node ../deploy/free/pages-build.mjs` |
| Build output directory | `dist/frontend/browser` |
| Environment variables | `LEADFORGE_API_URL` = `https://leadforge-api.onrender.com/api`, `NODE_VERSION` = `24` |

Then set `CORS_ORIGIN` on Render to the Pages address, and in Google Cloud add that address to the OAuth client's
authorised JavaScript origins.

## 6. Keep the backend awake

At cron-job.org (free), or UptimeRobot: a GET on `https://leadforge-api.onrender.com/api/auth/demo-status` every
10 minutes. Without it Render puts the backend to sleep after 15 minutes, and the Telegram bot and reminders stop.

## 7. Check it works

- [ ] The web app opens; sign in as admin, then change the admin password (Admin > Settings)
- [ ] A city search finds leads (the first one after a pause waits about 2 minutes while n8n wakes)
- [ ] A message in French and in English, a contact lookup, an Excel export
- [ ] Profile > Telegram connects; Admin > Overview shows Gemini, Serper and Geoapify use
- [ ] Actions > Database backup > Run workflow ends green

## Releasing a new version

Push to `main`. Render rebuilds the backend and Cloudflare rebuilds the web app by themselves. When the workflows
change, "Load n8n workflows" runs too; n8n picks them up the next time it wakes. A new API key: change it in your
local n8n, export the credentials again, update the `N8N_CREDENTIALS` secret, run "Load n8n workflows".

## Limits

- The first search after a quiet period waits about 2 minutes. Searches time out on the backend after 2.5 minutes of
  waiting for n8n (`N8N_WAKE_SECONDS`).
- 512 MB is tight for n8n: a very large search could stop it. It starts again on the next request.
- SnapDeploy's free plan has 100 container-hours a month: every time n8n wakes it stays up about 15 minutes.
- Render discourages keeping free services awake and could change its free plan. A backend restart (a deploy, or
  Render moving it) takes about 3 minutes.
- When users come, move the backend and n8n to one small server ([../DEPLOY.md](../DEPLOY.md)): the same images work.
