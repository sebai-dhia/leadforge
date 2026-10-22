# Leadforge app (Angular 22 + Spring Boot 4.1 + PostgreSQL + n8n)

```
Angular -> Spring Boot (auth, profile, DB) -> n8n "find-leads"    (responds at once, calls back later)
                |   ^                              |
                |   +-- POST /api/internal/n8n/results (shared secret)
                +--------------------------------> n8n "draft-message" (answers when the AI is done)
```

The browser never talks to n8n.

- **Search:** creates a `PENDING` job. n8n finds businesses (Geoapify), reads their websites for emails and booking widgets, scores each lead with transparent rules in code (no AI, so it takes seconds), and posts the leads back. The Angular page polls until the job is `DONE`. A sweeper marks jobs `FAILED` after 10 minutes without a callback.
- **Message:** written on demand, per lead, in English, French or Arabic, for email or WhatsApp. The backend calls the `draft-message` workflow and waits for the reply.
- **Leads:** a lead belongs to the user, not to one search. The home page lists every lead across all searches with filters, and exports them as an Excel file. The same business found by several searches is stored once and keeps its status and message.
- **Profile:** what you offer, the name you sign with and your default language. Saved once and used by every search and message.

## Run it

1. **Postgres**: `docker compose up -d postgres` (host port 5433, so it does not clash with a local Postgres on 5432).
2. **n8n** keeps its data in its own Postgres (`n8n-db` in `docker-compose.yml`), not in SQLite. Copy `.env.example` to `.env` and fill in `N8N_ENCRYPTION_KEY` and `N8N_DB_PASSWORD`, then either
   - `docker compose up -d` (n8n in Docker; needs a recent Docker: 20.10 cannot unpack the n8n image), and set `PUBLIC_BASE_URL=http://host.docker.internal:8081` for the backend, or
   - `tools/n8n-local.sh` (n8n on this machine, its database in Docker).

   Create the credentials below once in n8n, put their ids in `n8n-deploy-ids.js`, then load all three workflows with `tools/deploy-workflows.sh` (it builds them from `build-*.js`, imports and publishes them). Restart n8n after a deploy and run one throwaway search: the first search after a restart can still use the previous version.
   Credentials:

   | Node | Credential type | Name | Value |
   |---|---|---|---|
   | Webhook (both workflows) | Header Auth | `X-Webhook-Secret` | same as `N8N_WEBHOOK_SECRET` (default `dev-webhook-secret`) |
   | Geocode City, Geoapify Places | Query Auth | `apiKey` | your free Geoapify key (geoapify.com, no card) |
   | AI Write Message (draft workflow only) | Header Auth | `x-goog-api-key` | your Gemini API key |
   | Maps Search, Web Search, Serper Search | Header Auth | `X-API-KEY` | your Serper key (serper.dev, free credits) |
   | AI Check (lead-finder workflow) | Header Auth | `x-goog-api-key` | your Gemini API key (same credential as AI Write Message) |
| Send Results to Backend | Header Auth | `X-Callback-Secret` | same as `N8N_CALLBACK_SECRET` (default `dev-callback-secret`) |

   The AI model is `gemini-flash-lite-latest`. Use a model alias like this one: a specific retired name can return a misleading `401`.
3. **Backend**: `cd backend && ./mvnw spring-boot:run` (port 8081, because 8080 is often taken; Flyway creates the tables). It runs with the `local` profile, whose development settings are in `application-local.yml`; in an IDE, set the active profile to `local`.
4. **Frontend**: `cd frontend && npm install && npm start` (http://localhost:4200). Use quick demo accounts or register (if enabled), fill in your profile, then search.


## Deploy

- Free, no bank card: [deploy/hf/FREE-HOSTING.md](deploy/hf/FREE-HOSTING.md) (one Hugging Face Space, Supabase databases, GitHub Actions to publish and back up).
- On a Linux server: [deploy/DEPLOY.md](deploy/DEPLOY.md) (`docker-compose.prod.yml`, Caddy with HTTPS, nightly backups).

## Features & Highlights

- **Multi-Area & Interactive Leaflet Map**: Search across up to 3 cities/regions simultaneously or draw a bounding box directly on an interactive OpenStreetMap to discover local businesses anywhere in the world.
- **Contact-Aware Fit Scoring**: Transparent 1-10 score that prioritizes reachable businesses (phone, direct email, active social) and caps unreachable leads at 3/10.
- **Service-to-Niche Taxonomy**: Smart recommendation chips on the search page suggest top target niches cached by SHA-256 hash of the freelancer's profile offer.
- **Follow-up reminders on Telegram**: each person can connect their own Telegram chat on the Profile page (one-time link to the Leadforge bot, then Start). Once a day, from the hour they choose on the card (whole hours from 5:00 to 22:00, 9:00 by default, in their time zone taken from the browser when they connect), the bot lists the businesses they marked Contacted 3 days ago and a week ago that have not replied yet; then those leads are never reminded again. A day with nothing to follow up sends nothing. Marking a lead Contacted records when (`leads.contacted_at`); marking it Contacted again later starts the count over, and leads contacted before this feature start counting from the migration. One switch turns the reminders off, `/stop` in Telegram disconnects. Guests and shared demo accounts cannot connect.
- **Demo Guardrails**: Public demo mode with 5 concurrent active session cap, 15-minute idle expiry, one-click demo logins (`demo1@leadforge.dev`, `demo2@leadforge.dev`), read-only demo profiles, and separate admin bypass (`admin@leadforge.dev`).

## Config (environment variables)

`DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (32+ chars), `CORS_ORIGIN`, `N8N_WEBHOOK_URL`, `N8N_DRAFT_URL`, `N8N_WEBHOOK_SECRET`, `N8N_CALLBACK_SECRET`, `PUBLIC_BASE_URL`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ chars; they create the admin on the first start, then the admin changes them on the Admin page, Settings tab; `ADMIN_PASSWORD_RESET=true` applies them again at the next start when the password is lost), optionally `ADMIN_NAME` (the name on the admin's profile instead of "Admin"), `TELEGRAM_BOT_TOKEN` (the Leadforge bot: people connect their own chat to it for follow-up reminders) and `TELEGRAM_CHAT_ID` (the admin's chat for alerts: search service down, stuck searches, caps reached), `TELEGRAM_POLLING` (default `true`: the backend reads what people send the bot with long polling, so no public webhook is needed; only one running backend can read a bot, so use one bot per environment, or set it to `false` on the extra one), `CAP_SEARCHES_PER_DAY`, `CAP_DRAFTS_PER_DAY`, `CAP_ENRICH_PER_DAY` (ceilings for all users together; 0 turns one off). The limits, caps, guest and demo values can also be changed on the Admin page, Settings tab: they are saved in the database (`app_settings`), apply at once and win over `.env` until you choose "Use the .env value". Secrets are never shown or edited there. Settings live in `backend/src/main/resources/application.yml`. Addresses and secrets have no default there: the backend refuses to start without them, and the development values are in `application-local.yml` (profile `local`). Use new secrets in production. Never put API keys in a workflow node: keep them in n8n credentials, because workflow JSON gets committed.

## Lead quality benchmark

`node tools/benchmark.js` runs five fixed real searches (gyms in a drawn area, restaurants in Tunis, dentists in Sousse, hair salons in Ariana, hotels in Hammamet) and prints how many leads are reachable, have a website and fit strongly, plus the top five of each search with their reasons. Set `BENCH_EMAIL` and `BENCH_PASSWORD` first. Run it after changing the workflow; it spends real API credits.

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/register`, `/login` | Account and JWT |
| `GET`, `PUT /api/profile` | Offer, name, language. A search returns 422 until the profile is complete |
| `GET`, `PUT`, `DELETE /api/profile/telegram`; `POST /api/profile/telegram/link` | The caller's Telegram chat: status (`available`, `connected`, `notifications`), turn the follow-up reminders on or off and choose their hour (`PUT` with `notifications` and/or `hour`, 5 to 22; what is left out stays), disconnect. `/link` (`{lang: en\|fr, timeZone}`, the browser's IANA time zone) returns a one-time `t.me` link valid 15 minutes; pressing Start in Telegram connects the chat. 403 for guests and demo accounts, 503 when the server has no bot |
| `POST /api/searches`, `GET /api/searches`, `GET /api/searches/{id}` | Searches and their leads. A finished search reports `foundCount` and `newCount` (new to this user) |
| `GET /api/leads` | All of the caller's leads. Filters: `status`, `reachable`, `q` (name or address), `searchId`; `sort` = `score` | `recent` | `name`; `page`, `size`. Returns `counts` per status for the filter chips |
| `GET /api/leads/export.xlsx` | Same filters, as an Excel file (`lang=en\|fr` for the labels): readable status and language, links, real dates, frozen header and filters; named date first, then business type and place |
| `PATCH /api/leads/{id}/status` | `NEW`, `CONTACTED`, `REPLIED`, `NOT_INTERESTED` |
| `POST /api/leads/{id}/draft` | `{language: en\|fr\|ar, channel: email\|whatsapp}`, returns the lead with the message |
| `GET /api/admin/overview`, `/api/admin/users`, `/api/admin/searches` | Admin only (403 for everyone else). Accounts, active users (by last request), use in the last 24 h against the limits and caps, use per day for 30 days, searches by status (`FAILED` by default), and the AI and API use the workflows reported (`api_usage`: Gemini requests and tokens, Serper and Geoapify requests). A use given back after a failure stays in `usage_events` with `refunded = true`; it is not counted against any limit. Usage and searches of a deleted guest are kept without the account |
| `GET`, `PUT /api/admin/settings`; `GET`, `PUT /api/admin/account` | Admin only. Read and save the limits, caps, guest and demo settings (a null value goes back to the `.env` value; URLs and secrets from `.env` are never returned). `PUT /account` changes the admin's email and/or password and always needs the current password |

A lead is only reachable by the user who owns it (other users get 404).

## AI and API use (admin statistics)

After each run the three n8n workflows report what they spent: Gemini requests with input and output tokens (the answer's `usageMetadata`), Serper and Geoapify requests. The search workflow adds a `meter` object to its callback, the draft and contact lookup workflows to their reply; the backend stores one row per service in `api_usage`. Only requests that really answered are counted, and runs that failed before replying are not.
**The workflows must be deployed again** (`tools/deploy-workflows.sh`, then restart n8n) before they report anything; until a first report arrives the Overview shows "Not tracked yet". Tests of this code: `node --test workflow-src/meter.test.js`.
The Overview also shows, per service, when it last answered. A service counts as **silent** (an orange notice appears) when work that needs it was done in the last 24 hours, after the workflows began reporting, and it answered nothing: Serper after a finished search or contact lookup, Geoapify after a finished city search (a drawn area needs no geocoding), Gemini after a message was written. It usually means the key expired or the credits ran out. The keys themselves stay in n8n (Credentials) and cannot be seen or changed from the app.

## How duplicates are detected

When a search reports a business, the backend looks for an existing lead of the same user, in this order: Geoapify `place_id`, the last 8 digits of the phone number, the website host (social-media pages are never used), then the same name at the same address. A match is refreshed (contact details are merged, the score is recomputed) but its status and message are kept. Migration `V3` merged the duplicates that existed before this rule.

## Status

- Local ports: backend 8081, Postgres 5433, n8n 5678, Angular 4200.
- The backend's n8n client must use HTTP/1.1 with timeouts (the JDK default HTTP/2 upgrade hangs against n8n).
- Lead data from OpenStreetMap is thin in Tunisia: few leads have a website, phone or email. Scores are a rough ranking, not proof.
- Fit score (1 to 10) is rule-based: business type (appointment-based scores higher), no website (+2), website with no booking seen (+1), booking already offered (-1), large-organisation name (-2), phone or email found (+1). Each lead shows its reasons. It ranks leads, it does not prove need.
- Messages are drafts written from the listed facts only. Read and correct them before sending.
- Tests: `./mvnw test -Dtest='LeadMatchingTest,LeadCsvTest'` (pure unit tests). `BackendApplicationTests` needs the database running.
- Not included yet: email verification, refresh tokens, notes on a lead.

## Limits, contact lookup and tests (added later)

- Daily limits per user (rolling 24 h): 20 searches, 100 messages, 50 contact lookups (LIMIT_SEARCHES_PER_DAY, LIMIT_DRAFTS_PER_DAY, LIMIT_ENRICH_PER_DAY). A failed n8n call is refunded. GET /api/usage shows the counters; the API answers 429 at the limit.
- Login throttle: 5 failed logins per address and email, then 429 for 15 minutes. Sign-ups: 10 per address per hour. State is in memory (one backend instance).
- Contact data: search results also read the contact page, collect Facebook and Instagram links, and rank emails (business inboxes first, privacy and no-reply addresses last). POST /api/leads/{id}/enrich (workflow n8n/enrich-contact.workflow.json, third workflow, webhook `enrich-contact`) fills missing website, phone, emails and social pages. It searches the web with Serper (no AI), then reads the found site and its contact page. A result is only kept when it clearly belongs to the business: the page must carry the same phone number, or the business name plus words typical of its kind of business (so a clothing brand called NafNaf is not accepted for a hair salon). Social pages from search results need the same check. Placeholder emails (`votreadresse@...`) and tracking or share links are dropped. If Serper has no credits or rejects the key, the lead gets a note saying so.
- n8n Code nodes have no URL global: addresses are parsed by hand in workflow-snippets.js, and only public http(s) websites are fetched. Run n8n with no access to internal services.
- Known limit: a chain hotel whose website is the chain directory page can get the chain social pages.
- Tests: ./mvnw test (needs docker compose up -d; integration tests use the leadfinder_test database, created automatically). Workflow Code nodes are tested locally with the scripts used during development.
