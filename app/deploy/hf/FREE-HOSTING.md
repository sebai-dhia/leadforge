# Free hosting: Hugging Face + Supabase + GitHub

Costs $0 and needs no bank card. Everything runs in one free Hugging Face Space (Docker, 2 vCPU, 16 GB RAM):
Caddy serves the web app and `/api` on port 7860; the backend and n8n listen only inside the container. Both
databases are free Supabase projects, so a restart of the Space loses nothing.

| Part | Service | File |
|---|---|---|
| App container | Hugging Face Space | [Dockerfile](Dockerfile), [start.sh](start.sh) |
| Publishing a version | GitHub Actions | [.github/workflows/deploy-space.yml](../../../.github/workflows/deploy-space.yml) |
| Nightly backups | GitHub Actions | [.github/workflows/backup-db.yml](../../../.github/workflows/backup-db.yml) |
| Databases | Supabase (2 projects) | |
| Keep-awake and alerts | UptimeRobot | |

The Space is public, but it holds only the Dockerfile: it pulls the code from your private GitHub repo while it builds.

Do the steps in order. Keep every value you create in a password manager.

## 1. GitHub: private repository

1. Create a **private** repository on github.com (for example `leadforge`), with no README.
2. Push the project, from the project folder:
   ```bash
   git remote add origin https://github.com/YOU/leadforge.git
   git push -u origin main
   ```
3. A read-only token for the Space: Settings > Developer settings > Fine-grained tokens > Generate.
   Repository access: only `leadforge`. Permissions: **Contents: Read-only**. Expiration: the longest offered
   (renew it before it expires, or builds fail). Keep it as `GITHUB_TOKEN`.

## 2. Supabase: two databases

On supabase.com, sign in with GitHub, then create two projects in the same region (for example Frankfurt):
`leadforge` (the app) and `leadforge-n8n`. Use a strong database password for each (letters and digits only, so it
needs no escaping in URLs).

In **each** project:

1. **Turn off the Data API** (Project Settings > Data API, or Integrations > Data API): the app connects directly, and
   left on, the API would expose the tables.
2. Click **Connect** > **Session pooler** and note the host (like `aws-0-eu-central-1.pooler.supabase.com`), the
   port `5432`, the database `postgres` and the user (like `postgres.abcdefghijkl`).

Use the session pooler, not the direct connection: the direct one works over IPv6 only.

A free project is paused after a week without use. The running app uses its database all the time, so this only
happens if the Space is down for a week.

## 3. n8n credentials (on your PC)

The Space has no n8n editor: at every start it loads the credentials (your API keys) from a Space secret, then the
three workflows. Prepare them on your PC, with the local stack running (`docker compose up -d` in `app/`):

1. Create two new secrets (`openssl rand -hex 24`, twice). Put them in `app/.env` as `N8N_WEBHOOK_SECRET` and
   `N8N_CALLBACK_SECRET`, and in the local n8n editor (http://localhost:5678, Credentials) as the values of
   "Header Auth account" (`X-Webhook-Secret`) and "Header Auth account 2" (`X-Callback-Secret`). Restart the backend.
2. Export: `cd app && tools/n8n-credentials.sh export n8n-credentials.json`. The file is still encrypted with
   `N8N_ENCRYPTION_KEY` from `app/.env`; the Space must use that same key. Do not commit the file (it is ignored).

## 4. Hugging Face: the Space

1. Sign up at huggingface.co (no card). New Space: name `leadforge`, SDK **Docker**, template **Blank**,
   hardware **CPU basic (free)**, visibility **Public** (a private Space cannot be opened by visitors).
2. Settings > **Variables and secrets**. Secrets are hidden; variables are not, so only harmless values go there.

   **Variables**

   | Name | Value |
   |---|---|
   | `GITHUB_REPO` | `YOU/leadforge` |
   | `CORS_ORIGIN` | `https://YOU-leadforge.hf.space` (your Space's direct address) |
   | `GOOGLE_CLIENT_ID` | your OAuth client ID; add the address above to its authorised JavaScript origins |
   | `ADMIN_NAME` | your name, shown on the admin's profile |
   | `CAP_SEARCHES_PER_DAY` | `20` |
   | `CAP_DRAFTS_PER_DAY` | `100` |
   | `CAP_ENRICH_PER_DAY` | `30` |

   **Secrets**

   | Name | Value |
   |---|---|
   | `GITHUB_TOKEN` | the read-only token from step 1 |
   | `DB_URL` | `jdbc:postgresql://POOLER_HOST:5432/postgres?sslmode=require` (the `leadforge` project) |
   | `DB_USER` | its pooler user, `postgres.xxxxxxxx` |
   | `DB_PASSWORD` | its database password |
   | `DB_POSTGRESDB_HOST` | pooler host of the `leadforge-n8n` project |
   | `DB_POSTGRESDB_USER` | its pooler user |
   | `DB_POSTGRESDB_PASSWORD` | its database password |
   | `N8N_ENCRYPTION_KEY` | the same value as in your local `app/.env` |
   | `N8N_CREDENTIALS` | the whole content of `n8n-credentials.json` (open it, copy everything, paste) |
   | `N8N_WEBHOOK_SECRET`, `N8N_CALLBACK_SECRET` | the two values from step 3 |
   | `JWT_SECRET` | `openssl rand -hex 24` |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the admin account created at the first start (password 12+ characters) |
   | `TELEGRAM_BOT_TOKEN` | a **new** bot from @BotFather (one bot cannot serve your PC and the Space at once) |
   | `TELEGRAM_CHAT_ID` | your chat id, for the admin alerts |

3. Settings > Access Tokens on huggingface.co: create a **Write** token, for GitHub.

## 5. GitHub: let it publish to the Space

In the GitHub repository, Settings > Secrets and variables > Actions:

- Secret `HF_TOKEN`: the Hugging Face write token.
- Variable `HF_SPACE`: `YOU/leadforge` (your Hugging Face name / the Space name).
- Secrets `BACKUP_APP_DB_URL` and `BACKUP_N8N_DB_URL`, for the backups:
  `postgresql://postgres.xxxxxxxx:PASSWORD@POOLER_HOST:5432/postgres?sslmode=require`, one per project.

## 6. First release

```bash
git tag v0.1.0
git push --follow-tags
```

The "Deploy to Hugging Face" action copies the Dockerfile to the Space, and the Space builds (10 to 15 minutes,
Logs tab). At the first start the backend creates the tables and the admin, and n8n loads the credentials and
workflows. The app is ready when the log shows `Started BackendApplication` and n8n's `Editor is now accessible`.

Open the app at its **direct** address, `https://YOU-leadforge.hf.space`: inside the huggingface.co page it stays
blank on purpose (the app refuses to be framed).

Then check, in this order:

- [ ] The app opens; `https://YOU-leadforge.hf.space/api/internal/x` answers 404
- [ ] Sign in as admin, then change the admin password (Admin page, Settings tab)
- [ ] One search by city and one in a drawn area; leads arrive
- [ ] One message in French and one in English; one contact lookup; one Excel export
- [ ] Profile > Telegram connects
- [ ] Admin Overview shows Gemini, Serper and Geoapify use
- [ ] Demo and guest sign-ins work and stop at their limits

Then delete `n8n-credentials.json` from your PC.

## 7. Keep it awake, and alerts

A free Space sleeps after 48 hours without visits. On uptimerobot.com (free), add an HTTP monitor on
`https://YOU-leadforge.hf.space/api/auth/demo-status` every 5 minutes: it keeps the Space awake and emails you when
it is down. The backend also sends Telegram alerts (n8n down, stuck searches, caps reached).

## 8. Backups

The "Database backup" action runs every night and keeps 14 days of dumps. Run it once by hand now (Actions >
Database backup > Run workflow) and check the run has a `db-backup-N` artifact.

To restore, download and unzip the artifact, stop the Space (Settings > Pause), then:

```bash
pg_restore --clean --if-exists --no-owner --no-privileges -d "BACKUP_APP_DB_URL value" leadfinder-YYYYMMDD-HHMM.dump
pg_restore --clean --if-exists --no-owner --no-privileges -d "BACKUP_N8N_DB_URL value" n8n-YYYYMMDD-HHMM.dump
```

and restart the Space. Try a restore into a spare Supabase project once, early, to be sure the backups work.

## Releasing a new version

Commit, then `git tag v0.2.0 && git push --follow-tags`. The Space rebuilds and restarts; the app is down for the
build's last minute and the restart (about 2 minutes). Changed n8n workflows are loaded at the start: nothing else
to do.

**Rolling back**: Actions > Deploy to Hugging Face > Run workflow, and choose the older tag in "Use workflow from".
If the newer version added a database migration, restore the backup from before it first.

**Changing a setting**: edit it in the Space settings; the Space restarts by itself. A new `N8N_CREDENTIALS` (after
adding or changing an API key in your local n8n and exporting again) is applied at that restart.

## Limits of the free setup

- The address stays `...hf.space` (a custom domain is not free there).
- Hugging Face may restart the Space now and then: about 2 minutes down, nothing lost.
- Supabase free: 500 MB per database, plenty for an MVP.
- The APIs behind a search have their own free quotas: Serper's credits come **once**, Geoapify allows about 3,000
  requests a day, Gemini's free tier is rate-limited. Keep the caps low; raise them on the Admin page.
- Free plans and their terms can change. When the app has paying users, move to a server with
  [DEPLOY.md](../DEPLOY.md): the same app, a few euros a month.
