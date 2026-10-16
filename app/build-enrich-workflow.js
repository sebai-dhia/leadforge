// Generates n8n/enrich-contact.workflow.json (run: node build-enrich-workflow.js)
// Flow: Webhook -> web search for the business's own pages -> fetch its site and contact page -> Respond.
// The facts returned (emails, phones, social links) come from pages we fetched; the search only suggests where to look.
const fs = require('fs');
const { SAFE_URL, CONTACT_LINK, SCRAPE } = require('./workflow-snippets');

const promptCode = String.raw`
const b = ($input.first().json || {}).body || {};
const prompt = [
  'Find the official online presence of this local business using web search.',
  'Business: ' + b.leadName,
  b.address ? 'Address: ' + b.address : null,
  b.city ? 'City: ' + b.city : null,
  b.niche ? 'Category: ' + b.niche : null,
  b.website ? 'Known website: ' + b.website : 'No website is known.',
  '',
  'Reply with ONLY JSON: {"website": string or null, "facebook": string or null, "instagram": string or null}.',
  'Rules: give only URLs that appear in the search results and clearly belong to THIS business in THIS city. If you are not sure, use null. Never guess or build a URL yourself.'
].filter(x => x !== null).join('\n');
return [{ json: { prompt } }];
`.trim();

const pickCode = SAFE_URL + '\n' + String.raw`
const b = $('Webhook').first().json.body || {};
const r = $input.first().json || {};
let cand = {};
try {
  const raw = (r.candidates && r.candidates[0].content.parts.map(p => p.text || '').join('')) || '';
  cand = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) || {};
} catch (e) { cand = {}; }
const chunks = (r.candidates && r.candidates[0].groundingMetadata && r.candidates[0].groundingMetadata.groundingChunks) || [];
const sources = [...new Set(chunks.map(c => c.web && c.web.title).filter(Boolean))].slice(0, 5);
const known = safeUrl(b.website);
const suggested = safeUrl(cand.website);
return [{ json: {
  fetchUrl: known || suggested || null,
  foundWebsite: !known && suggested ? suggested : null,
  social: [cand.facebook, cand.instagram].filter(x => typeof x === 'string'),
  sources,
  searchFailed: !!r.error
}}];
`.trim();

const findLinkCode = SAFE_URL + '\n' + CONTACT_LINK + '\n' + String.raw`
const base = $('Pick Candidates').first().json.fetchUrl;
const item = $input.first();
const html = item && item.json && typeof item.json.data === 'string' ? item.json.data : '';
return [{ json: { contactUrl: base ? contactLink(html, base) : null } }];
`.trim();

const collectCode = SCRAPE + '\n' + String.raw`
const c = $('Pick Candidates').first().json;
const home = $('Fetch Site').first();
const contact = $input.first();
const a = scrape(home && home.json ? home.json.data : '');
const b = scrape(contact && contact.json ? contact.json.data : '');
const social = [...new Set([...(c.social || []), ...a.social, ...b.social])];
let note;
if (!c.fetchUrl && !social.length) note = c.searchFailed ? 'The web search is unavailable right now. Try again later.' : 'No website or social page could be found for this business.';
else if (c.fetchUrl && a.length === 0) note = 'The website did not respond.';
else if (c.fetchUrl) note = 'Checked the website and its contact page.';
else note = 'No website found. Social pages were found by web search; check they belong to this business.';
return [{ json: {
  website: c.foundWebsite || null,
  emails: [...new Set([...a.emails, ...b.emails])].slice(0, 8),
  phones: [...new Set([...a.phones, ...b.phones])].slice(0, 3),
  social: social.slice(0, 6),
  sources: c.sources || [],
  note
}}];
`.trim();

const pageOptions = { timeout: 8000, response: { response: { responseFormat: 'text' } } };

const workflow = {
  name: 'Lead Finder Enrich Contact',
  nodes: [
    {
      parameters: { httpMethod: 'POST', path: 'enrich-contact', authentication: 'headerAuth', responseMode: 'responseNode', options: {} },
      id: 'e1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
      webhookId: 'enrich-contact-backend'
    },
    {
      parameters: { jsCode: promptCode },
      id: 'e2', name: 'Build Search Prompt', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0]
    },
    {
      parameters: {
        method: 'POST',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: "={{ JSON.stringify({ contents: [{ parts: [{ text: $json.prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0, maxOutputTokens: 600 } }) }}"
      },
      id: 'e3', name: 'AI Web Search', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 0],
      retryOnFail: true, maxTries: 2, waitBetweenTries: 2000,
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: pickCode },
      id: 'e4', name: 'Pick Candidates', type: 'n8n-nodes-base.code', typeVersion: 2, position: [660, 0]
    },
    {
      parameters: { url: "={{ $json.fetchUrl || 'http://invalid.invalid/' }}", options: pageOptions },
      id: 'e5', name: 'Fetch Site', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [880, 0],
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: findLinkCode },
      id: 'e6', name: 'Find Contact Link', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1100, 0]
    },
    {
      parameters: { url: "={{ $json.contactUrl || 'http://invalid.invalid/' }}", options: pageOptions },
      id: 'e7', name: 'Fetch Contact Page', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1320, 0],
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: collectCode },
      id: 'e8', name: 'Collect', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1540, 0]
    },
    {
      parameters: { respondWith: 'json', responseBody: '={{ $json }}', options: {} },
      id: 'e9', name: 'Respond', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1760, 0]
    }
  ],
  connections: {
    'Webhook': { main: [[{ node: 'Build Search Prompt', type: 'main', index: 0 }]] },
    'Build Search Prompt': { main: [[{ node: 'AI Web Search', type: 'main', index: 0 }]] },
    'AI Web Search': { main: [[{ node: 'Pick Candidates', type: 'main', index: 0 }]] },
    'Pick Candidates': { main: [[{ node: 'Fetch Site', type: 'main', index: 0 }]] },
    'Fetch Site': { main: [[{ node: 'Find Contact Link', type: 'main', index: 0 }]] },
    'Find Contact Link': { main: [[{ node: 'Fetch Contact Page', type: 'main', index: 0 }]] },
    'Fetch Contact Page': { main: [[{ node: 'Collect', type: 'main', index: 0 }]] },
    'Collect': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

fs.mkdirSync('n8n', { recursive: true });
fs.writeFileSync('n8n/enrich-contact.workflow.json', JSON.stringify(workflow, null, 2));
console.log('written');
