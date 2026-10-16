# Leadforge: pipeline redesign (temporary draft)

Status: draft from a brainstorming session. Nothing here is implemented. Budget is $0.

## 1. Understanding (confirmed)

- **What:** a lead-finding tool for freelancers. It finds local businesses that may need a service, scores them for fit and for how reachable they are, and drafts outreach. Drafts only: no auto-sending.
- **Why:** an MVP/demo to prove the idea at $0 running cost.
- **Who:** the admin (owner) with a reserved slot outside the cap, plus 2 shared demo accounts for visitors. At most 5 live sessions at once. Telegram is admin only.
- **Access:** public landing page. When 5 sessions are active, a visitor who tries to sign in sees a "demo is full" message. Sign-in is email and password only.
- **Non-goals:** open self-registration, Google sign-in, direct social-media scraping, automated sending (email or WhatsApp), paid APIs, real multi-tenant scale.

## 2. Assumptions (confirmed by the owner)

1. Google sign-in is dropped, because 2 fixed shared accounts make it pointless.
2. Up to 5 people can use the same demo account at once and see the same leads, so demo data is reset or reseeded daily. Demo users cannot change the profile or quotas.
3. Each demo account has a small daily search and lookup budget. The admin has a separate reserve.
4. A session counts as active until about 15–30 minutes idle. The admin does not count toward the 5.
5. The demo logins are low-trust by design (shown on the landing page or handed out by the owner).
6. Free hosting for the backend, database and n8n is a separate, later question.

## 3. Recommended pipeline (a funnel, cheapest step first)

The bottleneck is contact data, not discovery. In the current data only about 20% of leads have any contact route (phone 20, website 9, email 9 of 103).

1. **Profile to niches.** One cached AI call turns the user's service (for example "UI/UX design") into niches likely to need it. The profile stays fixed on demo accounts.
2. **Free discovery.** Geoapify places (OpenStreetMap), up to 3 areas, by region or by drawn rectangle or polygon on a map. One call per area.
3. **Free filtering.** Fetch the business's site and contact page, extract emails, phones and social links. Score by rules, with no AI.
4. **Capped on-demand enrichment.** Serper search runs only for leads the user opens or for the top few results, and always against a daily budget. Cache results.
5. **Review.** Contact-aware ranking: a lead with a way to reach it ranks above one without.
6. **Outreach as drafts and links.** Email opens as a draft; WhatsApp opens a prefilled `wa.me` chat link. Nothing is sent by the app.
7. **Telegram (admin only).** A free bot driven by n8n. Start with one-way "new leads ready" notices, then simple commands.

### Free-tier reality (to verify before relying on it)
- Geoapify: 3,000 credits a day free, shared by all users.
- Serper: free credits are a **one-time** allowance, not monthly, so it can't be the permanent engine. Options: only on-demand use, a self-hosted SearXNG, or another search API with a monthly free tier. Current terms were not checked.
- Gemini free tier: enough for drafts, not for per-lead research.

## 4. Your concept compared to the recommendation

| Step | Verdict | Change |
|---|---|---|
| 1. Role/service profile | Keep | Add a service-to-niche mapping. |
| 2. Up to 3 regions or a map | Feasible, cheap | Add a Leaflet map and rectangle/polygon filter on the places call. |
| 3. Companies vs individuals | Partly | OpenStreetMap cannot separate them cleanly. Use category groups (doctors, lawyers, agencies). |
| 4. Search engines and social platforms | Main risk | Drop direct social scraping (blocked, against terms, costly). Keep "search name + city, keep the social page link". Define "verified" as name plus business type or phone match. |
| 5. WhatsApp or email outreach | Keep as drafts and links | No automated sending (number bans, spam law). |
| 6. Telegram | Good | Admin only. |

## 5. Quality findings from the current data (103 leads)

- Matching is mostly right on gyms, dentists, hotels, salons. About 9 of 35 "lawyers" are real: the first 20 were created before the category mapping existed and include supermarkets, a taxi station and a police station.
- 49 rows have no `place_id` (ids 1–51). They include 7 duplicate pairs the dedupe could not catch.
- Only 21 of 103 leads have any contact route.
- 95 of 103 score 7–9. "No website" gives everyone the same bonus, so the score barely separates leads.
- A few niche mismatches slip through (a youth centre as a hotel, a wedding hall as a beauty salon).

## 6. Changes needed (when implementation starts)

**Access and demo mode**
- Concurrent-session cap of 5 with idle timeout, a "demo is full" response on sign-in, and an admin slot outside the cap.
- Two fixed demo accounts plus the admin. Disable registration. Make demo profile and quotas read-only.
- Scheduled daily reset or reseed of demo data.
- A public landing page.
- Per-account daily search and lookup budgets, plus an admin reserve.

**Pipeline**
- Service-to-niche mapping (cached AI call).
- Region and map selection (up to 3 areas).
- Category groups instead of a company/individual toggle.
- Contact-aware scoring and ranking.
- Cache for lookup results, with a lookup budget check on every call.
- Decide what replaces Serper once its free credits end.
- Niche sanity check on map results.

**Outreach and notifications**
- Prefilled WhatsApp link and email draft actions.
- Telegram bot in n8n for admin notifications, then commands.

**Housekeeping**
- Delete the legacy leads with no `place_id` (ids 1–51) and re-run the searches. Needs a database delete that was blocked in this session.
- Improve dedupe for entries with different address text.
- Key rotation at the end (Google, Gemini, Groq, Geoapify, Serper) and deletion of the stale n8n credentials.
- Free hosting plan for backend, database and n8n, plus the n8n license check for a public demo.

## 7. Decision log

| Decision | Alternatives | Why |
|---|---|---|
| Budget is $0 | $10 or $30 a month | It is an MVP. |
| Funnel with capped, on-demand paid-tier steps | Enrich every lead automatically | Free quotas are shared and small. |
| Drop direct social scraping | Apify or proxies | Blocked, against terms, not free. |
| Outreach as drafts and links | Automated sending | Number bans and spam law risk. |
| 2 shared demo accounts plus admin | Open self-registration; approval-based registration | Lowest cost and effort. |
| Drop Google sign-in | Keep it | Pointless with fixed accounts. |
| Telegram for admin only | Telegram for all users | Owner's choice, and it avoids per-user bot state. |
| Cap at 5 concurrent sessions, rest see "demo is full" | Unlimited concurrent users | Protects the shared free quotas. |

## 8. Open items

- Which free search source replaces Serper after its credits run out.
- Where to host for free.
- Exact idle timeout and daily budget numbers per demo account.
- Whether to put the two demo logins on the landing page or give them out by hand.
