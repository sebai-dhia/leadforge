# Lead Finder V2 (Angular 22 + Spring Boot 4.1 + PostgreSQL + n8n)

```
Angular  ->  Spring Boot (auth, DB)  ->  n8n webhook (responds at once)
                  ^                              |
                  +---- POST /api/internal/n8n/results (shared secret) ----+
```

The browser never talks to n8n. A search creates a `PENDING` job, n8n works in the background and posts the leads back, and the Angular page polls until the job is `DONE`.

## Run it

1. **Postgres**: `docker compose up -d`
2. **n8n**: `npx n8n`, then import `n8n/lead-finder.workflow.json` (regenerate with `node build-workflow.js`).
   Create three *Header Auth* credentials and attach them in the workflow:
   | Where | Header name | Value |
   |---|---|---|
   | Webhook node | `X-Webhook-Secret` | same as `N8N_WEBHOOK_SECRET` (default `dev-webhook-secret`) |
   | Google Places Search | `X-Goog-Api-Key` | your Google key (Places API New) |
   | Claude Score and Draft | `x-api-key` | your Anthropic key |
   | Send Results to Backend | `X-Callback-Secret` | same as `N8N_CALLBACK_SECRET` (default `dev-callback-secret`) |
   Activate the workflow.
3. **Backend**: `cd backend && ./mvnw spring-boot:run` (port 8080; Flyway creates the tables).
4. **Frontend**: `cd frontend && npm start` (http://localhost:4200). Register, then run a search.

If n8n runs in Docker, set `PUBLIC_BASE_URL=http://host.docker.internal:8080` for the backend so n8n can reach the callback.

## Config (environment variables)

`DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (32+ chars), `CORS_ORIGIN`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `N8N_CALLBACK_SECRET`, `PUBLIC_BASE_URL`. The defaults are for local development only. Change all secrets before deploying.

## Status

- Backend compiles and the Angular app builds. **Not yet run end to end**: it needs Docker/Postgres, n8n and your API keys.
- Known gap: if n8n crashes mid-run, the job stays `PENDING` forever. Add a timeout that marks old pending jobs `FAILED`.
- Not included yet: per-user quotas, rate limiting, Stripe, email verification, refresh tokens, backend tests.
