// Generates n8n/lead-finder.workflow.json for the Spring Boot backend (run: node build-workflow.js)
// Flow: Webhook (responds at once) -> geocode city -> Geoapify places -> fetch sites -> AI (Gemini) -> POST results to backend callback.
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
  if (lead._empty) return { json: { _empty: true, prompt: 'Reply with {}' } };
  const html = typeof item.json.data === 'string' ? item.json.data : '';
  const scraped = (html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g) || [])
    .map(e => e.toLowerCase())
    .filter(e => !/\\.(png|jpe?g|gif|svg|webp)$/.test(e) && !/(sentry|wixpress|example|domain)\\./.test(e));
  const found = [...new Set([lead.osmEmail ? lead.osmEmail.toLowerCase() : null, ...scraped].filter(Boolean))];
  const text = html.replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 3000);
  const web = lead.website
    ? 'Website: ' + lead.website + '\\nWebsite text excerpt: ' + (text || '(could not be fetched)')
    : 'No website is listed for this business (it may have little or no online presence, which can mean it needs a web app, booking or ordering system).';
  const prompt = [
    'You help a freelancer find clients who need custom software (web apps, booking/ordering systems, internal tools, automation, dashboards).',
    'Freelancer name: ' + lead.sender,
    'Freelancer offer: ' + lead.service,
    '',
    'Business: ' + lead.name + ' (' + lead.niche + ', ' + lead.city + ')',
    web,
    '',
    'Task: 1) score 0-10 how likely this business needs custom software the freelancer offers (outdated or missing site, no online booking/ordering, manual processes). 2) one-sentence reason grounded in what you know. 3) write a short (max 90 words), specific, non-spammy cold email in English with one clear low-pressure question at the end. Use ONLY facts given above. Never write that you noticed, saw or reviewed anything you were not given. Do not assert that the business lacks a website, booking system or any tool; instead say you could not find one online or ask whether they have one. Do not guess the owner first name from the business name; greet with the business name or a neutral greeting.',
    'Reply with ONLY JSON: {"score":number,"reason":string,"subject":string,"emailBody":string}'
  ].join('\\n');
  const out = { ...lead, emails: found.slice(0, 3), prompt };
  delete out.osmEmail;
  return { json: out };
});
`.trim();

const formatCode = `
const jobId = $('Webhook').first().json.body.jobId;
const leads = $('Extract').all();
const out = [];
$input.all().forEach((item, i) => {
  const lead = { ...leads[i].json };
  if (lead._empty) return;
  delete lead.prompt; delete lead.niche; delete lead.city; delete lead.service; delete lead.sender;
  let r = {};
  try {
    const raw = (item.json.candidates && item.json.candidates[0].content.parts.map(p => p.text || '').join('')) || item.json.choices[0].message.content;
    r = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch (e) { r = { score: 0, reason: 'AI output could not be parsed', subject: '', emailBody: '' }; }
  out.push({ ...lead, score: Math.round(Number(r.score) || 0), reason: r.reason, subject: r.subject, emailBody: r.emailBody });
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
      parameters: {
        method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: "={{ JSON.stringify({ contents: [{ parts: [{ text: $json.prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 2000 } }) }}",
        // one request every 5 s keeps us under free-tier rate limits
        options: { batching: { batch: { batchSize: 1, batchInterval: 5000 } } }
      },
      id: 'n6', name: 'AI Score and Draft', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1540, 0],
      retryOnFail: true, maxTries: 4, waitBetweenTries: 5000,
      onError: 'continueRegularOutput'
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
    'Extract': { main: [[{ node: 'AI Score and Draft', type: 'main', index: 0 }]] },
    'AI Score and Draft': { main: [[{ node: 'Format', type: 'main', index: 0 }]] },
    'Format': { main: [[{ node: 'Send Results to Backend', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

fs.mkdirSync('n8n', { recursive: true });
fs.writeFileSync('n8n/lead-finder.workflow.json', JSON.stringify(workflow, null, 2));
console.log('written');
