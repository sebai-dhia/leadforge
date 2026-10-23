# Free hosting: Cloudflare Pages + Render + Supabase

Costs $0 and needs no bank card. Each part runs where a free plan fits it:

| Part | Where | Awake |
|---|---|---|
| Web app | **Cloudflare Pages** (static files) | always |
| Backend | **Render** free web service `leadforge-api` (512 MB, 0.1 CPU) | woken every hour by a ping, and by visitors |
| n8n | **Render** free web service `leadforge-n8n` (512 MB, 0.1 CPU) | sleeps; wakes when the backend calls it |
| Databases | **Supabase**, projects `leadforge` and `leadforge-n8n` | always |

A free Render service sleeps after 15 minutes without traffic and only uses the workspace's 750 free hours a month
while awake. The hourly ping (about 190 hours a month) and real use stay well under that, so both services fit in one
workspace. Keep other apps out of this workspace: they share the 750 hours.

Measured with the same limits on a PC: the backend uses about 360 MB and takes about 3 minutes to start, n8n about
335 MB and a few minutes on 0.1 CPU. So the first visitor after a quiet hour waits a few minutes, and the first search
after a pause waits a few minutes more while n8n wakes.

| File | What it does |
|---|---|
| [`render.yaml`](../../../render.yaml) | Both Render services (Blueprint): Dockerfile or image, memory settings, the settings to fill in |
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

Then Actions > **Load n8n workflows** > Run workflow. The first run creates n8n's tables in Supabase (about 6
minutes) and ends green with "Owner account created". Delete `n8n-credentials.json` from your PC afterwards.

## 3. Render: the backend and n8n

Sign up at render.com with GitHub, in a workspace without other services. **New > Blueprint**, choose this repository:
it reads `render.yaml` and creates both services, asking for the values marked there.

`leadforge-n8n`:

| Name | Value |
|---|---|
| `DB_POSTGRESDB_HOST`, `DB_POSTGRESDB_USER`, `DB_POSTGRESDB_PASSWORD` | the `leadforge-n8n` values |
| `N8N_ENCRYPTION_KEY` | from `app/.env` |

`leadforge-api`:

| Name | Value |
|---|---|
| `DB_URL` | `jdbc:postgresql://<leadforge host>:5432/postgres?sslmode=require` |
| `DB_USER`, `DB_PASSWORD` | the `leadforge` values |
| `JWT_SECRET` | the new secret |
| `CORS_ORIGIN` | the web app's address from step 4, like `https://leadforge.pages.dev` (fix it after step 4 if it differs) |
| `PUBLIC_BASE_URL` | this service's address, like `https://leadforge-api.onrender.com` |
| `N8N_WEBHOOK_URL` | `<n8n address>/webhook/find-leads` |
| `N8N_DRAFT_URL` | `<n8n address>/webhook/draft-message` |
| `N8N_ENRICH_URL` | `<n8n address>/webhook/enrich-contact` |
| `N8N_WEBHOOK_SECRET`, `N8N_CALLBACK_SECRET` | the two secrets from `app/.env` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | the admin account (password 12+ characters) |
| `GOOGLE_CLIENT_ID` | your OAuth client ID |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | a new bot from @BotFather, and your chat id |

Render shows each service's address (like `https://leadforge-n8n.onrender.com`) as soon as the Blueprint is created;
if a name was taken, it has a suffix, so copy the real ones. The first build and start take about 10 minutes.

Check: `<n8n address>/healthz` answers `{"status":"ok"}`, and `<backend address>/api/auth/demo-status` answers. If a
backend setting is missing, its log says `Set the environment variable ...`.

## 4. Cloudflare Pages: the web app

Sign up at cloudflare.com (no card). Workers & Pages > Create > **Pages** > Connect to Git > this repository:

| Setting | Value |
|---|---|
| Project name | `leadforge` (gives `leadforge.pages.dev`) |
| Production branch | `main` |
| Root directory | `app/frontend` |
| Build command | `npm ci && npx ng build --configuration production && node ../deploy/free/pages-build.mjs` |
| Build output directory | `dist/frontend/browser` |
| Environment variables | `LEADFORGE_API_URL` = `<backend address>/api`, `NODE_VERSION` = `24.15.0` (Angular needs 24.15 or later) |

Then set `CORS_ORIGIN` on Render to the Pages address, and in Google Cloud add that address to the OAuth client's
authorised JavaScript origins.

## 5. Wake the backend every hour

At cron-job.org (free): a GET on `<backend address>/api/auth/demo-status` every hour at minute 50, so the backend is
awake on the hour when the Telegram reminders are sent. Telegram messages to the bot (connecting a chat, `/stop`)
are answered at the next wake-up; Telegram keeps them for 24 hours.

## 6. Check it works

- [ ] The web app opens (the first time, wait a few minutes while the backend wakes); sign in as admin, then change
      the admin password (Admin > Settings)
- [ ] A city search finds leads (the first one after a pause waits a few more minutes while n8n wakes)
- [ ] A message in French and in English, a contact lookup, an Excel export
- [ ] Profile > Telegram connects; Admin > Overview shows Gemini, Serper and Geoapify use
- [ ] Actions > Database backup > Run workflow ends green

## Restoring a backup

Download and unzip the `db-backup-N` artifact of a "Database backup" run (Actions tab). Stop the backend (Render:
`leadforge-api` > Settings > Suspend), then restore with the connection strings of the two Supabase projects:

```bash
pg_restore --clean --if-exists --no-owner --no-privileges -d "BACKUP_APP_DB_URL value" leadfinder-YYYYMMDD-HHMM.dump
pg_restore --clean --if-exists --no-owner --no-privileges -d "BACKUP_N8N_DB_URL value" n8n-YYYYMMDD-HHMM.dump
```

and resume the backend. Try a restore into a spare Supabase project once, early, to be sure the backups work.

## Releasing a new version

Push to `main`. Render rebuilds the backend and Cloudflare rebuilds the web app by themselves. When the workflows
change, "Load n8n workflows" runs too; n8n picks them up the next time it wakes. A new API key: change it in your
local n8n, export the credentials again, update the `N8N_CREDENTIALS` secret, run "Load n8n workflows".

## Limits

- Slow first visits after quiet periods (backend and n8n wake on 0.1 CPU). The backend waits up to 5 minutes for n8n
  (`N8N_WAKE_SECONDS`).
- 512 MB is tight for n8n: a very large search could stop it. It starts again on the next request.
- n8n keeps only failed runs (7 days, 500 at most): a stored run is about 230 KB, and Supabase's free plan allows
  500 MB per database. The app's own database grows about 1.2 KB per lead.
- Render's free hours are per workspace: other services in the same workspace use them too.
- When users come, move the backend and n8n to one small server ([../DEPLOY.md](../DEPLOY.md)): the same images work.
