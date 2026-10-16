// Generates n8n/lead-finder.workflow.json for the Spring Boot backend (run: node build-workflow.js)
// Flow: Webhook (responds at once) -> geocode city -> Geoapify places -> fetch sites -> rule-based score -> POST results to backend callback.
const fs = require('fs');

const queryCode = `
const body = $('Webhook').first().json.body || {};
const g = ($input.first().json.results || [])[0];
if (!g) return [{ json: { _empty: true } }];
const map = [
  [/dent/i, 'healthcare.dentist'],
  [/clinic|doctor|medical|physician|clinique|medecin/i, 'healthcare.clinic_or_praxis'],
  [/pharmac/i, 'healthcare.pharmacy'],
  [/restaurant/i, 'catering.restaurant'],
  [/caf[eé]|coffee/i, 'catering.cafe'],
  [/hotel|guest ?house|riad/i, 'accommodation.hotel'],
  [/gym|fitness/i, 'sport.fitness'],
  [/hair|salon|beauty|barber|spa\\b/i, 'service.beauty'],
  [/lawyer|law firm|attorney|avocat/i, 'office.lawyer'],
  [/car repair|garage|mechanic/i, 'service.vehicle.repair.car'],
  [/supermarket|grocery/i, 'commercial.supermarket'],
  [/bakery|pastry|patisserie/i, 'commercial.food_and_drink.bakery'],
  [/school|academy|training/i, 'education.school']
];
const hit = map.find(([re]) => re.test(body.niche || ''));
return [{ json: {
  lon: g.lon, lat: g.lat,
  categories: hit ? hit[1] : 'commercial,service,office,catering',
  name: hit ? null : body.niche
}}];
`.trim();

const prepareCode = `
const body = $('Webhook').first().json.body || {};
const feats = (($input.first().json.features) || []).filter(f => f.properties && f.properties.name);
if (!feats.length) return [{ json: { _empty: true } }];
const fix = u => (u && !/^https?:\\/\\//i.test(u) ? 'http://' + u : u) || null;
return feats.map(f => {
  const p = f.properties, c = p.contact || {}, raw = (p.datasource && p.datasource.raw) || {};
  return { json: {
    placeId: p.place_id || null,
    name: p.name,
    address: p.address_line2 || p.formatted || null,
    phone: p.phone || c.phone || raw.phone || raw['contact:phone'] || null,
    osmEmail: c.email || p.email || raw.email || raw['contact:email'] || null,
    rating: null,
    reviews: 0,
    website: fix(p.website || c.website || raw.website || raw['contact:website'] || null),
    niche: body.niche, city: body.city,
    service: body.service, sender: body.sender
  }};
});
`.trim();

const extractCode = `
const leads = $('Prepare').all();
return $input.all().map((item, i) => {
  const lead = leads[i].json;
  if (lead._empty) return { json: { _empty: true } };
  const html = typeof item.json.data === 'string' ? item.json.data : '';
  const scraped = (html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g) || [])
    .map(e => e.toLowerCase())
    .filter(e => !/\\.(png|jpe?g|gif|svg|webp)$/.test(e) && !/(sentry|wixpress|example|domain)\\./.test(e));
  const found = [...new Set([lead.osmEmail ? lead.osmEmail.toLowerCase() : null, ...scraped].filter(Boolean))];
  const hasBooking = /calendly|doctolib|booking|book now|book an? appointment|reserv|rendez-vous|prendre rdv|appointment|\\u062d\\u062c\\u0632|\\u0645\\u0648\\u0639\\u062f/i.test(html);
  const out = { ...lead, emails: found.slice(0, 3), hasBooking, siteChecked: html.length > 0 };
  delete out.osmEmail;
  return { json: out };
});
`.trim();

const scoreCode = `
// Transparent rule-based fit score (1-10). No AI: it is instant, free and explainable.
return $input.all().map(item => {
  const l = item.json;
  if (l._empty) return item;
  const niche = (l.niche || '').toLowerCase();
  const appointment = /dent|clinic|clinique|doctor|medecin|physio|kine|salon|hair|beauty|barber|spa\\b|lawyer|avocat|law|gym|fitness|hotel|guest|garage|car repair|mechanic|pharmac/.test(niche);
  const food = /restaurant|caf[eé]|bakery|pastry|patisserie/.test(niche);
  let score = appointment ? 6 : food ? 5 : 4;
  const why = [appointment ? 'Appointment-based business' : food ? 'Reservation and ordering business' : 'Local business'];
  const flags = [];
  if (!l.website) { score += 2; flags.push('no website listed'); }
  else if (l.hasBooking) { score -= 1; flags.push('website already mentions online booking'); }
  else if (l.siteChecked) { score += 1; flags.push('website found, no online booking seen'); }
  else { flags.push('website could not be checked'); }
  if (/group|groupe|international|global|network|holding|banque|bank|assurance|insurance|corporate/i.test(l.name || '')) {
    score -= 2; flags.push('looks like a large organisation');
  }
  const hasEmail = !!(l.emails && l.emails.length);
  if (hasEmail || l.phone) {
    score += 1;
    flags.push(hasEmail && l.phone ? 'phone and email available' : l.phone ? 'phone available' : 'email available');
  } else { flags.push('no contact details found yet'); }
  score = Math.max(1, Math.min(10, score));
  return { json: { ...l, score, reason: why[0] + ': ' + flags.join(', ') + '.' } };
});
`.trim();

const formatCode = `
const jobId = $('Webhook').first().json.body.jobId;
const out = $input.all().map(i => i.json).filter(l => !l._empty).map(l => {
  const r = { ...l, subject: '', emailBody: '' };
  for (const k of ['niche', 'city', 'service', 'sender', 'hasBooking', 'siteChecked']) delete r[k];
  return r;
});
out.sort((a, b) => b.score - a.score);
return [{ json: { jobId, leads: out } }];
`.trim();

const callbackUrl = "={{ $('Webhook').first().json.body.callbackUrl }}";
const geoQueryAuth = { authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth' };

const workflow = {
  name: 'Lead Finder Backend',
  nodes: [
    {
      parameters: {
        httpMethod: 'POST', path: 'find-leads', authentication: 'headerAuth',
        responseMode: 'onReceived', options: {}
      },
      id: 'n1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
      webhookId: 'find-leads-backend'
    },
    {
      parameters: {
        url: 'https://api.geoapify.com/v1/geocode/search', ...geoQueryAuth,
        sendQuery: true, specifyQuery: 'json',
        jsonQuery: "={{ JSON.stringify({ text: $json.body.city, limit: 1, format: 'json' }) }}"
      },
      id: 'n9', name: 'Geocode City', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [220, 0],
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: queryCode },
      id: 'n10', name: 'Build Query', type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, 0]
    },
    {
      parameters: {
        url: 'https://api.geoapify.com/v2/places', ...geoQueryAuth,
        sendQuery: true, specifyQuery: 'json',
        jsonQuery: "={{ JSON.stringify({ categories: $json.categories, filter: 'circle:' + $json.lon + ',' + $json.lat + ',10000', limit: 20, ...($json.name ? { name: $json.name } : {}) }) }}"
      },
      id: 'n2', name: 'Geoapify Places', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [660, 0],
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: prepareCode },
      id: 'n3', name: 'Prepare', type: 'n8n-nodes-base.code', typeVersion: 2, position: [880, 0]
    },
    {
      parameters: {
        url: "={{ $json.website || 'http://localhost:1' }}",
        options: { timeout: 8000, response: { response: { responseFormat: 'text' } } }
      },
      id: 'n4', name: 'Fetch Website', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1100, 0],
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: extractCode },
      id: 'n5', name: 'Extract', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1320, 0]
    },
    {
      parameters: { jsCode: scoreCode },
      id: 'n6', name: 'Score', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1540, 0]
    },
    {
      parameters: { jsCode: formatCode },
      id: 'n7', name: 'Format', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1760, 0]
    },
    {
      parameters: {
        method: 'POST', url: callbackUrl,
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json) }}'
      },
      id: 'n8', name: 'Send Results to Backend', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1980, 0]
    }
  ],
  connections: {
    'Webhook': { main: [[{ node: 'Geocode City', type: 'main', index: 0 }]] },
    'Geocode City': { main: [[{ node: 'Build Query', type: 'main', index: 0 }]] },
    'Build Query': { main: [[{ node: 'Geoapify Places', type: 'main', index: 0 }]] },
    'Geoapify Places': { main: [[{ node: 'Prepare', type: 'main', index: 0 }]] },
    'Prepare': { main: [[{ node: 'Fetch Website', type: 'main', index: 0 }]] },
    'Fetch Website': { main: [[{ node: 'Extract', type: 'main', index: 0 }]] },
    'Extract': { main: [[{ node: 'Score', type: 'main', index: 0 }]] },
    'Score': { main: [[{ node: 'Format', type: 'main', index: 0 }]] },
    'Format': { main: [[{ node: 'Send Results to Backend', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

fs.mkdirSync('n8n', { recursive: true });
fs.writeFileSync('n8n/lead-finder.workflow.json', JSON.stringify(workflow, null, 2));
console.log('written');
