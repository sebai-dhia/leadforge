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
   | Send Results to Backend | Header Auth | `X-Callback-Secret` | same as `N8N_CALLBACK_SECRET` (default `dev-callback-secret`) |

   Publish both workflows. The AI model is `gemini-flash-lite-latest`. Use a model alias like this one: a specific retired name can return a misleading `401`.
3. **Backend**: `cd backend && ./mvnw spring-boot:run` (port 8081, because 8080 is often taken; Flyway creates the tables).
4. **Frontend**: `cd frontend && npm install && npm start` (http://localhost:4200). Register, fill in your profile, then search.

If n8n runs in Docker, set `PUBLIC_BASE_URL=http://host.docker.internal:8081` for the backend so n8n can reach the callback.

## Config (environment variables)

`DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (32+ chars), `CORS_ORIGIN`, `N8N_WEBHOOK_URL`, `N8N_DRAFT_URL`, `N8N_WEBHOOK_SECRET`, `N8N_CALLBACK_SECRET`, `PUBLIC_BASE_URL`. The defaults are for local development only. Change all secrets before deploying. Never put API keys in a workflow node: keep them in n8n credentials, because workflow JSON gets committed.

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/register`, `/login` | Account and JWT |
| `GET`, `PUT /api/profile` | Offer, name, language. A search returns 422 until the profile is complete |
| `POST /api/searches`, `GET /api/searches`, `GET /api/searches/{id}` | Searches and their leads |
| `PATCH /api/leads/{id}/status` | `NEW`, `CONTACTED`, `REPLIED`, `NOT_INTERESTED` |
| `POST /api/leads/{id}/draft` | `{language: en\|fr\|ar, channel: email\|whatsapp}`, returns the lead with the message |

Leads are only reachable through a search the caller owns (other users get 404).

## Status

- Local ports: backend 8081, Postgres 5433, n8n 5678, Angular 4200.
- The backend's n8n client must use HTTP/1.1 with timeouts (the JDK default HTTP/2 upgrade hangs against n8n).
- Lead data from OpenStreetMap is thin in Tunisia: few leads have a website, phone or email. Scores are a rough ranking, not proof.
- Fit score (1 to 10) is rule-based: business type (appointment-based scores higher), no website (+2), website with no booking seen (+1), booking already offered (-1), large-organisation name (-2), phone or email found (+1). Each lead shows its reasons. It ranks leads, it does not prove need.
- Messages are drafts written from the listed facts only. Read and correct them before sending.
- Not included yet: duplicate detection across searches, per-user quotas, rate limiting, CSV export, email verification, refresh tokens, backend tests.
