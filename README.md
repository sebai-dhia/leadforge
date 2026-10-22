# Leadforge (beta)

Leadforge helps freelancers find local businesses that could use their services. Describe what you offer, pick a
city or draw an area on the map, and Leadforge lists the businesses there, scores how good a fit and how reachable
each one is, and drafts a first message for each one in English, French or Arabic, by email or WhatsApp. You read
and correct every draft before sending it.

**Status:** public beta. The source is public while the beta runs; no license is granted to reuse it.

## What it does

- **Search by city or by area**: up to 3 cities at once, or a rectangle drawn on an OpenStreetMap map.
- **Fit score from 1 to 10, with its reasons**: rules in code (business type, website, online booking, contact
  details found), so every score can be explained. Businesses that cannot be reached are capped at 3.
- **Contact lookup**: finds a missing website, phone, email or social page, and keeps it only when it clearly belongs
  to the business.
- **Message drafts** written by AI from the facts found, never invented, in the user's language and channel.
- **Lead tracking**: every lead across all searches, with statuses (new, contacted, replied, not interested),
  filters and an Excel export. A business found twice is kept once.
- **Follow-up reminders on Telegram**: 3 days and a week after a lead was contacted with no reply.
- **Demo and guest access** with limits, and an admin area: accounts, usage, AI and API costs, settings.

## How it works

```
Browser (Angular) ──> Caddy ──> Spring Boot API ──> PostgreSQL
                                      │  ▲
                                      ▼  │ results
                                     n8n workflows ──> Geoapify, Serper, Gemini
```

The browser only talks to the API. The API runs searches, contact lookups and drafts through three n8n workflows,
which call the outside services; API keys stay in n8n's encrypted credentials.

| Part | Built with |
|---|---|
| Web app | Angular 22, Leaflet |
| API | Spring Boot 4.1, Java 21, Flyway |
| Database | PostgreSQL 17 |
| Workflows | n8n, Geoapify (places), Serper (web search), Gemini (AI) |
| Hosting | Docker, Caddy |

## Repository

| Folder | What it is |
|---|---|
| [`app/`](app/README.md) | The product: frontend, backend, n8n workflows. How to run it locally. |
| [`app/deploy/`](app/deploy) | Deployment: [free hosting](app/deploy/hf/FREE-HOSTING.md) (Hugging Face + Supabase) or [a server](app/deploy/DEPLOY.md) |

To run it on your machine, start with [app/README.md](app/README.md).
