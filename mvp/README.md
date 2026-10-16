# Lead Finder MVP

Form → n8n webhook → Google Places → fetch each website → Claude scores "needs custom software" and drafts an email → results page. Nothing is sent automatically; you review and send each draft.

## Setup

1. **Run n8n**: `npx n8n` (opens http://localhost:5678).
2. **Import** `n8n/lead-finder.workflow.json` (Workflows → Import from file).
3. **Create two "Header Auth" credentials** and attach them:
   - Node *Google Places Search*: name `X-Goog-Api-Key`, value = your Google Maps Platform key (enable "Places API (New)").
   - Node *Claude Score and Draft*: name `x-api-key`, value = your Anthropic API key.
4. **Activate** the workflow (use the Production URL, e.g. `http://localhost:5678/webhook/find-leads`). For testing without activating, use "Listen for test event" and the `/webhook-test/` URL.
5. **Open** `web/index.html` in a browser, paste the webhook URL, fill the form, run.

## Notes / limits

- Returns up to 10 businesses per search; only those with a website are kept (emails are scraped from the homepage).
- Fit score is the model's guess from the homepage text and reviews. Treat it as a sort order, not truth.
- Cold email laws (GDPR, CAN-SPAM) still apply: identify yourself, offer opt-out, target businesses, not private individuals.

## Next steps

Save leads to a database, scrape contact pages, create Gmail drafts via the Gmail node, follow-up reminders, user accounts.
