// Generates n8n/enrich-contact.workflow.json (run: node build-enrich-workflow.js)
// Flow: Webhook -> search the web (Serper) for the business -> pick candidates that match its name
//       -> fetch its site and contact page -> verify the page really belongs to the business -> Respond.
// No AI is used: matching is by name tokens, so it is fast, cheap and explainable.
// Facts returned (emails, phones, social links) come from pages we fetched or from search results.
const fs = require('fs');
const { SAFE_URL, CONTACT_LINK, SCRAPE } = require('./workflow-snippets');

// Shared by Pick Candidates and Collect. Accents are removed, generic words are ignored, and a
// result only counts when most of the distinctive words of the business name appear in it.
const NAME_MATCH = String.raw`
const STOP = new Set(['hotel','hotels','cabinet','dr','dre','docteur','doctor','clinique','clinic','restaurant','cafe','salon','coiffure',
  'pharmacie','pharmacy','the','and','des','les','chez','tunis','tunisie','tunisia','dentaire','dentiste','avocat','maitre','spa','gym','fitness']);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = s => norm(s).split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 3 && !STOP.has(t));
const ratio = (needle, hay) => {
  const t = tokens(needle);
  if (!t.length) return 0;
  const h = norm(hay);
  return t.filter(x => h.includes(x)).length / t.length;
};
// What a page of this kind of business talks about. A page that shares the name but none of these is
// probably a different business (a fashion brand called "NafNaf" is not a hair salon).
const NICHES = [
  [/dent/i, 'dentist|dentaire|dentiste|dental|orthodon|\u0623\u0633\u0646\u0627\u0646'],
  [/clinic|doctor|medical|physician|clinique|medecin/i, 'clinique|clinic|medecin|docteur|doctor|patient|consultation|sante|health|\u0637\u0628\u064a\u0628|\u0639\u064a\u0627\u062f\u0629'],
  [/pharmac/i, 'pharmacie|pharmacy|medicament|ordonnance|\u0635\u064a\u062f\u0644'],
  [/restaurant/i, 'restaurant|menu|cuisine|plats?\\b|chef|\u0645\u0637\u0639\u0645'],
  [/caf[e\u00e9]|coffee/i, 'cafe|coffee|boisson|\u0645\u0642\u0647\u0649'],
  [/hotel|guest ?house|riad/i, 'hotel|chambre|rooms?\\b|suite|sejour|resort|guest|\u0641\u0646\u062f\u0642'],
  [/gym|fitness/i, 'gym|fitness|musculation|coach|abonnement|\u0646\u0627\u062f\u064a'],
  [/hair|salon|beauty|barber|spa\b/i, 'coiffure|coiffeu|hair|barber|beaute|beauty|esthetique|manucure|\u062d\u0644\u0627\u0642|\u062a\u062c\u0645\u064a\u0644'],
  [/lawyer|law firm|attorney|avocat/i, 'avocat|lawyer|law firm|juridique|\u0645\u062d\u0627\u0645'],
  [/car repair|garage|mechanic/i, 'garage|mecanique|automobile|voiture|vidange|reparation'],
  [/supermarket|grocery/i, 'supermarche|supermarket|courses|hypermarche|rayon'],
  [/bakery|pastry|patisserie/i, 'boulangerie|patisserie|bakery|gateau|viennoiserie'],
  [/school|academy|training/i, 'ecole|school|formation|eleves|enseignement|\u0645\u062f\u0631\u0633\u0629']
];
const nicheRe = niche => { const hit = NICHES.find(([re]) => re.test(niche || '')); return hit ? new RegExp(hit[1], 'i') : null; };
const plainText = html => String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
`.trim();

const queryCode = String.raw`
const b = ($input.first().json || {}).body || {};
const q = [b.leadName, b.city].filter(Boolean).join(' ').trim().slice(0, 200);
return [{ json: { q } }];
`.trim();

const pickCode = SAFE_URL + '\n' + NAME_MATCH + '\n' + String.raw`
const b = $('Webhook').first().json.body || {};
const r = $input.first().json || {};
const searchFailed = !!r.error && !r.organic;
const msg = String((r.error && (r.error.message || r.error)) || '');
const searchProblem = !searchFailed ? '' : /401|403|unauthor|invalid/i.test(msg) ? 'key' : /402|429|credit|quota|limit/i.test(msg) ? 'quota' : 'other';

const DIRECTORY = /(^|\.)(facebook|instagram|linkedin|twitter|tiktok|youtube|pinterest|tripadvisor|booking|yelp|pagesjaunes|foursquare|google|wikipedia|expedia|agoda|kayak|trivago|hotels|airbnb|mapcarta|zomato|opentable|thefork|yellowpages|waze|bing|yahoo|duckduckgo|med|pharmaboardroom|kompass|europages|cylex|hotfrog|opendi|jumia|tayara|annuaire|doctolib|doctoranytime|tabibi|drest|tripadvisor|restaurantguru|cybo|local|infobel|societe|pagesjaunes)\./i;
const known = safeUrl(b.website);
const kind = nicheRe(b.niche);
const phoneDigits = String(b.phone || '').replace(/\D/g, '').slice(-8);
const organic = Array.isArray(r.organic) ? r.organic : [];
let website = null, websiteTitle = null;
const social = [], sources = [];

for (const it of organic) {
  const p = parseUrl(it.link);
  if (!p) continue;
  const host = p.hostname.replace(/^www\./, '');
  const pathText = decodeURIComponent((p.rest || '').split(/[?#]/)[0].replace(/[-_.\/]+/g, ' '));
  const hay = (it.title || '') + ' ' + (it.snippet || '') + ' ' + pathText;
  if (/(^|\.)(facebook|instagram)\.com$/i.test(host)) {
    const sHay = (it.title || '') + ' ' + (it.snippet || '');
    const sameKind = (kind && kind.test(norm(sHay + ' ' + host + ' ' + pathText))) || (phoneDigits.length >= 6 && sHay.replace(/\D/g, '').includes(phoneDigits));
    if (social.length < 2 && sameKind && ratio(b.leadName, (it.title || '') + ' ' + pathText) >= 0.6) { social.push(it.link); if (it.title) sources.push(it.title); }
    continue;
  }
  if (DIRECTORY.test(host + '.')) continue;
  if (!website && ratio(b.leadName, hay + ' ' + host) >= 0.6) {
    const safe = safeUrl(it.link);
    if (safe) { website = safe; websiteTitle = it.title || null; }
  }
}
const kg = r.knowledgeGraph;
if (!known && !website && kg && kg.website && ratio(b.leadName, kg.title || '') >= 0.6) {
  const safe = safeUrl(kg.website);
  if (safe) { website = safe; websiteTitle = kg.title || null; }
}
if (websiteTitle) sources.unshift(websiteTitle);
return [{ json: {
  fetchUrl: known || website || null,
  foundWebsite: !known && website ? website : null,
  needsVerify: !known && !!website,
  social, sources: sources.slice(0, 3), searchFailed, searchProblem, results: organic.length
}}];
`.trim();

const findLinkCode = SAFE_URL + '\n' + CONTACT_LINK + '\n' + String.raw`
const base = $('Pick Candidates').first().json.fetchUrl;
const item = $input.first();
const html = item && item.json && typeof item.json.data === 'string' ? item.json.data : '';
return [{ json: { contactUrl: base ? contactLink(html, base) : null } }];
`.trim();

const collectCode = SCRAPE + '\n' + NAME_MATCH + '\n' + String.raw`
const b = $('Webhook').first().json.body || {};
const c = $('Pick Candidates').first().json;
const home = $('Fetch Site').first();
const contact = $input.first();
const homeHtml = home && home.json && typeof home.json.data === 'string' ? home.json.data : '';
const a = scrape(homeHtml);
const k = scrape(contact && contact.json ? contact.json.data : '');

// A website found by search must mention the business name, or its phone number, before we trust it.
const phoneKey = String(b.phone || '').replace(/\D/g, '').slice(-8);
const text = plainText(homeHtml);
const kind = nicheRe(b.niche);
const phoneHit = phoneKey.length >= 6 && homeHtml.replace(/\D/g, '').includes(phoneKey);
// An online shop that sells a brand is not a local business of that name, even if its menus mention "beauty".
const shopSignals = (norm(text).match(/panier|add to cart|ajouter au panier|checkout|livraison gratuite|cart\b/g) || []).length;
const verified = !c.needsVerify || (a.length > 0 && (phoneHit || (shopSignals < 3 && ratio(b.leadName, text) >= 0.6 && !!kind && kind.test(norm(text)))));

let website = null, emails = [], phones = [], social = [...(c.social || []), ...(verified ? [...a.social, ...k.social] : [])];
if (verified) {
  website = c.foundWebsite || null;
  emails = [...new Set([...a.emails, ...k.emails])].slice(0, 8);
  phones = [...new Set([...a.phones, ...k.phones])].slice(0, 3);
}
social = [...new Set(social)].slice(0, 6);

let note;
if (c.searchFailed) {
  note = c.searchProblem === 'key' ? 'The search service rejected its API key. Check the key in n8n.'
    : c.searchProblem === 'quota' ? 'The search service has no credits or requests left.'
    : 'The search service is unavailable right now. Try again later.';
} else if (c.needsVerify && !verified) {
  note = 'A possible website was found, but its page does not clearly belong to this business (name, phone or type of business do not match), so it was ignored.';
} else if (c.fetchUrl && a.length === 0) {
  note = 'The website did not respond.';
} else if (c.fetchUrl && c.needsVerify) {
  note = 'Found the website by web search and confirmed it mentions this business. Checked its contact page too.';
} else if (c.fetchUrl) {
  note = 'Checked the website and its contact page.';
} else if (social.length) {
  note = 'No website found. Social pages were found by search; check they belong to this business.';
} else {
  note = c.results ? 'The search found no website or social page that clearly matches this business.' : 'The search returned nothing for this business.';
}
return [{ json: { website, emails, phones, social, sources: c.sources || [], note } }];
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
      parameters: { jsCode: queryCode },
      id: 'e2', name: 'Build Query', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0]
    },
    {
      parameters: {
        method: 'POST', url: 'https://google.serper.dev/search',
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ q: $json.q, num: 10 }) }}',
        options: { timeout: 15000 }
      },
      id: 'e3', name: 'Serper Search', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 0],
      retryOnFail: true, maxTries: 2, waitBetweenTries: 1500,
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
    'Webhook': { main: [[{ node: 'Build Query', type: 'main', index: 0 }]] },
    'Build Query': { main: [[{ node: 'Serper Search', type: 'main', index: 0 }]] },
    'Serper Search': { main: [[{ node: 'Pick Candidates', type: 'main', index: 0 }]] },
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
