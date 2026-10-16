# Lead Finder V2 (Angular 22 + Spring Boot 4.1 + PostgreSQL + n8n)

```
Angular  ->  Spring Boot (auth, DB)  ->  n8n webhook (responds at once)
                  ^                              |
                  +---- POST /api/internal/n8n/results (shared secret) ----+
```

The browser never talks to n8n. A search creates a `PENDING` job, n8n works in the background and posts the leads back, and the Angular page polls until the job is `DONE`.

## Run it

1. **Postgres**: `docker compose up -d` (host port 5433, so it does not clash with a local Postgres on 5432)
2. **n8n**: `npx n8n`, then import `n8n/lead-finder.workflow.json` (regenerate with `node build-workflow.js`).
   Create these credentials and attach them in the workflow (n8n auto-fills the first credential of a type it finds, so check each node picked the right one):
   | Node | Credential type | Name | Value |
   |---|---|---|---|
   | Webhook | Header Auth | `X-Webhook-Secret` | same as `N8N_WEBHOOK_SECRET` (default `dev-webhook-secret`) |
   | Geocode City and Geoapify Places (same credential) | Query Auth | `apiKey` | your free Geoapify key (geoapify.com, no card) |
   | AI Score and Draft | **Bearer Auth** | (token) | your Groq key, bare, without the word `Bearer`. Model: `openai/gpt-oss-120b`. Any OpenAI-compatible provider works by changing the URL and model |
   | Send Results to Backend | Header Auth | `X-Callback-Secret` | same as `N8N_CALLBACK_SECRET` (default `dev-callback-secret`) |
   Publish the workflow.

   Lead source: Geoapify Places (OpenStreetMap-based). Free plan: 3,000 credits/day, attribution required (shown in the app footer).
3. **Backend**: `cd backend && ./mvnw spring-boot:run` (port 8081, because 8080 is often taken; Flyway creates the tables).
4. **Frontend**: `cd frontend && npm start` (http://localhost:4200). Register, then run a search.

If n8n runs in Docker, set `PUBLIC_BASE_URL=http://host.docker.internal:8081` for the backend so n8n can reach the callback.

## Config (environment variables)

`DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (32+ chars), `CORS_ORIGIN`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `N8N_CALLBACK_SECRET`, `PUBLIC_BASE_URL`. The defaults are for local development only. Change all secrets before deploying.

## Status

- Local ports: backend 8081, Postgres 5433, n8n 5678, Angular 4200.
- The backend's n8n client must use HTTP/1.1 with timeouts (the JDK default HTTP/2 upgrade hangs against n8n).
- Lead data from OpenStreetMap is thin in Tunisia: few leads have a website, phone or email.
- Known gap: if n8n crashes mid-run, the job stays `PENDING` forever. Add a timeout that marks old pending jobs `FAILED`.
- Not included yet: per-user quotas, rate limiting, Stripe, email verification, refresh tokens, backend tests.
