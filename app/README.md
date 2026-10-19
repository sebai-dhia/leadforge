# Lead Finder V2 (Angular 22 + Spring Boot 4.1 + PostgreSQL + n8n)

```
Angular -> Spring Boot (auth, profile, DB) -> n8n "find-leads"    (responds at once, calls back later)
                |   ^                              |
                |   +-- POST /api/internal/n8n/results (shared secret)
                +--------------------------------> n8n "draft-message" (answers when the AI is done)
```

The browser never talks to n8n.

- **Search:** creates a `PENDING` job. n8n finds businesses (Geoapify), reads their websites for emails and booking widgets, scores each lead with transparent rules in code (no AI, so it takes seconds), and posts the leads back. The Angular page polls until the job is `DONE`. A sweeper marks jobs `FAILED` after 10 minutes without a callback.
- **Message:** written on demand, per lead, in English, French or Arabic, for email or WhatsApp. The backend calls the `draft-message` workflow and waits for the reply.
- **Leads:** a lead belongs to the user, not to one search. The home page lists every lead across all searches with filters, and exports them as CSV. The same business found by several searches is stored once and keeps its status and message.
- **Profile:** what you offer, the name you sign with and your default language. Saved once and used by every search and message.

## Run it

1. **Postgres**: `docker compose up -d` (host port 5433, so it does not clash with a local Postgres on 5432).
2. **n8n**: `npx n8n`, then create the two workflows from `n8n/lead-finder.workflow.json` and `n8n/draft-message.workflow.json` (regenerate with `node build-workflow.js` and `node build-draft-workflow.js`).
   n8n auto-fills the first credential of a type it finds, so check each node picked the right one. Credentials:

   | Node | Credential type | Name | Value |
   |---|---|---|---|
   | Webhook (both workflows) | Header Auth | `X-Webhook-Secret` | same as `N8N_WEBHOOK_SECRET` (default `dev-webhook-secret`) |
   | Geocode City, Geoapify Places | Query Auth | `apiKey` | your free Geoapify key (geoapify.com, no card) |
   | AI Write Message (draft workflow only) | Header Auth | `x-goog-api-key` | your Gemini API key |
   | Serper Search (enrich workflow only) | Header Auth | `X-API-KEY` | your Serper key (serper.dev, free credits) |
| Send Results to Backend | Header Auth | `X-Callback-Secret` | same as `N8N_CALLBACK_SECRET` (default `dev-callback-secret`) |
| Telegram Alert (lead-finder workflow) | Telegram API | `Telegram account` | your Telegram Bot token from @BotFather |

   Publish both workflows. The AI model is `gemini-flash-lite-latest`. Use a model alias like this one: a specific retired name can return a misleading `401`.
3. **Backend**: `cd backend && ./mvnw spring-boot:run` (port 8081, because 8080 is often taken; Flyway creates the tables).
4. **Frontend**: `cd frontend && npm install && npm start` (http://localhost:4200). Use quick demo accounts or register (if enabled), fill in your profile, then search.

If n8n runs in Docker, set `PUBLIC_BASE_URL=http://host.docker.internal:8081` for the backend so n8n can reach the callback.

## Features & Highlights

- **Multi-Area & Interactive Leaflet Map**: Search across up to 3 cities/regions simultaneously or draw a bounding box directly on an interactive OpenStreetMap to discover local businesses anywhere in the world.
- **Contact-Aware Fit Scoring**: Transparent 1-10 score that prioritizes reachable businesses (phone, direct email, active social) and caps unreachable leads at 3/10.
- **Service-to-Niche Taxonomy**: Smart recommendation chips on the search page suggest top target niches cached by SHA-256 hash of the freelancer's profile offer.
- **Telegram Lead Alerts**: Immediate Telegram notifications sent via n8n upon search completion with summary statistics and top opportunities.
- **Demo Guardrails**: Public demo mode with 5 concurrent active session cap, 15-minute idle expiry, one-click demo logins (`demo1@leadforge.dev`, `demo2@leadforge.dev`), read-only demo profiles, and separate admin bypass (`admin@leadforge.dev`).

## Config (environment variables)

`DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (32+ chars), `CORS_ORIGIN`, `N8N_WEBHOOK_URL`, `N8N_DRAFT_URL`, `N8N_WEBHOOK_SECRET`, `N8N_CALLBACK_SECRET`, `PUBLIC_BASE_URL`, `ADMIN_PASSWORD` (12+ chars; applied to the admin account at startup), `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (admin alerts: failed searches, caps reached, new leads from the admin's own searches), `CAP_SEARCHES_PER_DAY`, `CAP_DRAFTS_PER_DAY`, `CAP_ENRICH_PER_DAY` (ceilings for all users together; 0 turns one off). The defaults are for local development only. Change all secrets before deploying. Never put API keys in a workflow node: keep them in n8n credentials, because workflow JSON gets committed.

## Lead quality benchmark

`node tools/benchmark.js` runs five fixed real searches (gyms in a drawn area, restaurants in Tunis, dentists in Sousse, hair salons in Ariana, hotels in Hammamet) and prints how many leads are reachable, have a website and fit strongly, plus the top five of each search with their reasons. Set `BENCH_EMAIL` and `BENCH_PASSWORD` first. Run it after changing the workflow; it spends real API credits.

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/register`, `/login` | Account and JWT |
| `GET`, `PUT /api/profile` | Offer, name, language. A search returns 422 until the profile is complete |
| `POST /api/searches`, `GET /api/searches`, `GET /api/searches/{id}` | Searches and their leads. A finished search reports `foundCount` and `newCount` (new to this user) |
| `GET /api/leads` | All of the caller's leads. Filters: `status`, `reachable`, `q` (name or address), `searchId`; `sort` = `score` | `recent` | `name`; `page`, `size`. Returns `counts` per status for the filter chips |
| `GET /api/leads/export.csv` | Same filters, as a UTF-8 CSV with BOM (opens correctly in Excel, Arabic included). Cells that look like formulas are neutralised |
| `PATCH /api/leads/{id}/status` | `NEW`, `CONTACTED`, `REPLIED`, `NOT_INTERESTED` |
| `POST /api/leads/{id}/draft` | `{language: en\|fr\|ar, channel: email\|whatsapp}`, returns the lead with the message |

A lead is only reachable by the user who owns it (other users get 404).

## How duplicates are detected

When a search reports a business, the backend looks for an existing lead of the same user, in this order: Geoapify `place_id`, the last 8 digits of the phone number, the website host (social-media pages are never used), then the same name at the same address. A match is refreshed (contact details are merged, the score is recomputed) but its status and message are kept. Migration `V3` merged the duplicates that existed before this rule.

## Status

- Local ports: backend 8081, Postgres 5433, n8n 5678, Angular 4200.
- The backend's n8n client must use HTTP/1.1 with timeouts (the JDK default HTTP/2 upgrade hangs against n8n).
- Lead data from OpenStreetMap is thin in Tunisia: few leads have a website, phone or email. Scores are a rough ranking, not proof.
- Fit score (1 to 10) is rule-based: business type (appointment-based scores higher), no website (+2), website with no booking seen (+1), booking already offered (-1), large-organisation name (-2), phone or email found (+1). Each lead shows its reasons. It ranks leads, it does not prove need.
- Messages are drafts written from the listed facts only. Read and correct them before sending.
- Tests: `./mvnw test -Dtest='LeadMatchingTest,LeadCsvTest'` (pure unit tests). `BackendApplicationTests` needs the database running.
- Not included yet: per-user quotas, rate limiting, email verification, refresh tokens, integration tests, notes on a lead.

## Limits, contact lookup and tests (added later)

- Daily limits per user (rolling 24 h): 20 searches, 100 messages, 50 contact lookups (LIMIT_SEARCHES_PER_DAY, LIMIT_DRAFTS_PER_DAY, LIMIT_ENRICH_PER_DAY). A failed n8n call is refunded. GET /api/usage shows the counters; the API answers 429 at the limit.
- Login throttle: 5 failed logins per address and email, then 429 for 15 minutes. Sign-ups: 10 per address per hour. State is in memory (one backend instance).
- Contact data: search results also read the contact page, collect Facebook and Instagram links, and rank emails (business inboxes first, privacy and no-reply addresses last). POST /api/leads/{id}/enrich (workflow n8n/enrich-contact.workflow.json, third workflow, webhook `enrich-contact`) fills missing website, phone, emails and social pages. It searches the web with Serper (no AI), then reads the found site and its contact page. A result is only kept when it clearly belongs to the business: the page must carry the same phone number, or the business name plus words typical of its kind of business (so a clothing brand called NafNaf is not accepted for a hair salon). Social pages from search results need the same check. Placeholder emails (`votreadresse@...`) and tracking or share links are dropped. If Serper has no credits or rejects the key, the lead gets a note saying so.
- n8n Code nodes have no URL global: addresses are parsed by hand in workflow-snippets.js, and only public http(s) websites are fetched. Run n8n with no access to internal services.
- Known limit: a chain hotel whose website is the chain directory page can get the chain social pages.
- Tests: ./mvnw test (needs docker compose up -d; integration tests use the leadfinder_test database, created automatically). Workflow Code nodes are tested locally with the scripts used during development.
