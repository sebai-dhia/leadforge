# Deploying Leadforge on a server

No bank card? Use [hf/FREE-HOSTING.md](hf/FREE-HOSTING.md) instead (Hugging Face + Supabase, no card needed).

The whole stack ([docker-compose.prod.yml](../docker-compose.prod.yml)) runs on one Oracle Cloud Always Free ARM server,
with a free DuckDNS address; Caddy gets the HTTPS certificate by itself. Hosting costs nothing. What can cost money
is the APIs behind a search (see [API credits](#api-credits)).

| Script | What it does |
|---|---|
| `deploy/server-setup.sh` | Once, on a fresh server: firewall ports, Docker, rclone, swap, automatic security updates |
| `deploy/deploy.sh [version]` | Backup, check out the version (latest `main` by default), rebuild, reload the n8n workflows when they changed, wait until the site answers |
| `deploy/backup.sh` | Dumps both databases into `app/backups` (7 days), copies them to `BACKUP_REMOTE` (30 days) |

## 1. Oracle Cloud server

1. Sign up at cloud.oracle.com. A card is asked for identity only: Always Free resources are never charged.
   The **home region cannot be changed later**; a less busy one (for example Frankfurt or Marseille, not Ashburn) has
   fewer "Out of capacity" errors.
2. Compute > Instances > Create instance:
   - Image: **Canonical Ubuntu 24.04**. Shape: **Ampere VM.Standard.A1.Flex**, 2 OCPU and 12 GB (up to 4 and 24 is free).
   - Add your SSH public key. Boot volume: 100 GB.
   - "Out of capacity": try another availability domain, or again a few hours later.
3. Networking > Virtual cloud networks > your VCN > Security Lists > Default > Add ingress rules, source `0.0.0.0/0`:
   TCP 80, TCP 443, UDP 443.
4. Note the instance's public IP.

**Idle servers.** Oracle may reclaim an Always Free instance that stays nearly idle for 7 days (CPU, network and
memory all under 20%). Upgrading the account to Pay As You Go stops this and Always Free stays free; just never create
non-free resources.

## 2. Free address (DuckDNS)

Sign in at duckdns.org, create a subdomain (for example `leadforge` → `leadforge.duckdns.org`) and set its IP to the
server's public IP. Oracle keeps the IP while the instance exists, so nothing needs updating later.

Check from your PC: `nslookup leadforge.duckdns.org` returns the server's IP.

## 3. Server setup

```bash
ssh ubuntu@SERVER_IP
# read-only key for the private GitHub repo: add the printed key under repo Settings > Deploy keys
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 && cat ~/.ssh/id_ed25519.pub
git clone git@github.com:YOU/leadforge.git
cd leadforge/app
sudo bash deploy/server-setup.sh
exit   # log in again so docker works without sudo
```

## 4. Settings and n8n credentials

On your PC, with the local stack running, export the n8n credentials (the API keys, still encrypted):

```bash
cd app && tools/n8n-credentials.sh export n8n-credentials.json
scp n8n-credentials.json ubuntu@SERVER_IP:~/leadforge/app/
```

On the server: `cp .env.prod.example .env.prod`, `nano .env.prod`, and fill in every value:

- `DOMAIN=leadforge.duckdns.org`
- each secret from `openssl rand -hex 24`
- `N8N_ENCRYPTION_KEY`: **the same value as in your local `app/.env`**, or the imported credentials cannot be read
- `TELEGRAM_BOT_TOKEN`: a **new** bot from @BotFather. Only one backend can read a bot, so production and your PC
  cannot share one
- `GOOGLE_CLIENT_ID`: and add `https://leadforge.duckdns.org` to its authorised JavaScript origins in Google Cloud
- low caps to start, see [API credits](#api-credits)

Keep a copy of `.env.prod` in your password manager: it is not in git and not in the backups.

## 5. First deploy

```bash
cd ~/leadforge/app
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d n8n-db n8n
tools/n8n-credentials.sh import n8n-credentials.json && rm n8n-credentials.json
deploy/deploy.sh
```

The first build takes 5 to 10 minutes. Then check, in this order:

- [ ] `https://leadforge.duckdns.org` opens with a valid certificate; `/api/internal/x` answers 404
- [ ] Sign in as admin, then change the admin password (Admin page, Settings tab)
- [ ] One search by city and one in a drawn area; leads arrive
- [ ] One message in French and one in English; one contact lookup; one Excel export
- [ ] Profile > Telegram connects; a reminder hour can be chosen
- [ ] Admin Overview shows Gemini, Serper and Geoapify use (not "Not tracked yet")
- [ ] Demo and guest sign-ins work and hit their limits

## 6. Backups and monitoring

Copies off the server (Google Drive here): on your PC install rclone and run `rclone authorize "drive"`; on the server
run `rclone config`, new remote `gdrive`, type `drive`, scope `drive.file`, answer **n** to "Use web browser" and paste
the token from your PC. Then set `BACKUP_REMOTE=gdrive:leadforge-backups` in `.env.prod` and test:

```bash
deploy/backup.sh
```

Every night at 03:30 (`crontab -e`):

```
30 3 * * * $HOME/leadforge/app/deploy/backup.sh >> $HOME/backup.log 2>&1
```

Monitoring: a free UptimeRobot HTTP monitor on `https://leadforge.duckdns.org/api/auth/demo-status`. The backend
already sends Telegram alerts (to `TELEGRAM_CHAT_ID`) when n8n is down, searches are stuck or a cap is reached.

## Releasing a new version

On your PC: commit, tag (`git tag v0.2.0`), `git push --follow-tags`. On the server:

```bash
cd ~/leadforge/app && deploy/deploy.sh
```

The site is down for about 30 seconds while the backend restarts. Then run one search.

### Rolling back

```bash
deploy/deploy.sh v0.1.0
```

If the newer version added a database migration (`backend/src/main/resources/db/migration`), the older backend
may fail to start or misbehave on the newer schema: restore the backup `deploy.sh` made just before, then deploy the
old version.

### Restoring a backup

```bash
export COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILES=.env.prod
docker compose stop backend
docker compose exec -T db pg_restore -U leadfinder -d leadfinder --clean --if-exists < backups/leadfinder-YYYYMMDD-HHMMSS.dump
docker compose start backend
# n8n the same way: stop n8n, restore n8n-....dump into service n8n-db (user and database n8n), start n8n
```

Restore a dump into a test database once, early, to be sure the backups work.

## API credits

Hosting is free; each search spends API quota:

| Service | Free allowance | When it runs out |
|---|---|---|
| Gemini | free tier, rate-limited | messages and AI checks fail |
| Serper | about 2,500 credits, **once** | web search and contact lookup stop (the Admin page shows Serper as silent) |
| Geoapify | about 3,000 requests a day | city searches fail until the next day |

Start low and raise later on the Admin page (Settings tab), which applies at once:
`CAP_SEARCHES_PER_DAY=20`, `CAP_DRAFTS_PER_DAY=100`, `CAP_ENRICH_PER_DAY=30`, guests at 1 or 2 searches a day.

## Useful commands

```bash
export COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILES=.env.prod   # then plain docker compose works
docker compose ps
docker compose logs -f --tail 100 backend
ssh -L 5678:localhost:5678 ubuntu@SERVER_IP    # n8n editor at http://localhost:5678 on your PC
```
