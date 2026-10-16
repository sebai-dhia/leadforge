// Generates n8n/lead-finder.workflow.json for the Spring Boot backend (run: node build-workflow.js)
// Flow: Webhook (responds at once) -> Places -> fetch sites -> Claude -> POST results to backend callback.
const fs = require('fs');

const prepareCode = `
const body = $('Webhook').first().json.body || {};
const places = ($input.first().json.places || []).filter(p => p.websiteUri);
if (!places.length) return [{ json: { _empty: true } }];
return places.map(p => ({ json: {
  name: p.displayName && p.displayName.text,
  address: p.formattedAddress,
  phone: p.nationalPhoneNumber || null,
  rating: p.rating || null,
  reviews: p.userRatingCount || 0,
  website: p.websiteUri,
  niche: body.niche, city: body.city,
  service: body.service, sender: body.sender
}}));
`.trim();

const extractCode = `
const leads = $('Prepare').all();
return $input.all().map((item, i) => {
  const lead = leads[i].json;
  if (lead._empty) return { json: { _empty: true, prompt: 'Reply with {}' } };
  const html = typeof item.json.data === 'string' ? item.json.data : '';
  const found = [...new Set((html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g) || [])
    .map(e => e.toLowerCase())
    .filter(e => !/\\.(png|jpe?g|gif|svg|webp)$/.test(e) && !/(sentry|wixpress|example|domain)\\./.test(e)))];
  const text = html.replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 3000);
  const prompt = [
    'You help a freelancer find clients who need custom software (web apps, booking/ordering systems, internal tools, automation, dashboards).',
    'Freelancer name: ' + lead.sender,
    'Freelancer offer: ' + lead.service,
    '',
    'Business: ' + lead.name + ' (' + lead.niche + ', ' + lead.city + ')',
    'Website: ' + lead.website,
    'Rating: ' + lead.rating + ' from ' + lead.reviews + ' reviews',
    'Website text excerpt: ' + (text || '(could not be fetched)'),
    '',
    'Task: 1) score 0-10 how likely this business needs custom software the freelancer offers (outdated site, no online booking/ordering, manual processes, many reviews = busy). 2) one-sentence reason grounded in what you saw. 3) write a short (max 90 words), specific, non-spammy cold email in the language of the business website, no fake claims, one clear low-pressure question at the end.',
    'Reply with ONLY JSON: {"score":number,"reason":string,"subject":string,"emailBody":string}'
  ].join('\\n');
  return { json: { ...lead, emails: found.slice(0, 3), prompt } };
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
    const raw = item.json.content[0].text;
    r = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch (e) { r = { score: 0, reason: 'AI output could not be parsed', subject: '', emailBody: '' }; }
  out.push({ ...lead, score: Math.round(Number(r.score) || 0), reason: r.reason, subject: r.subject, emailBody: r.emailBody });
});
out.sort((a, b) => b.score - a.score);
return [{ json: { jobId, leads: out } }];
`.trim();

const callbackUrl = "={{ $('Webhook').first().json.body.callbackUrl }}";

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
        method: 'POST', url: 'https://places.googleapis.com/v1/places:searchText',
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: { parameters: [{
          name: 'X-Goog-FieldMask',
          value: 'places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount'
        }] },
        sendBody: true, specifyBody: 'json',
        jsonBody: "={{ JSON.stringify({ textQuery: $json.body.niche + ' in ' + $json.body.city, maxResultCount: 10 }) }}"
      },
      id: 'n2', name: 'Google Places Search', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [220, 0]
    },
    {
      parameters: { jsCode: prepareCode },
      id: 'n3', name: 'Prepare', type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, 0]
    },
    {
      parameters: {
        url: "={{ $json.website || 'http://localhost:1' }}",
        options: { timeout: 8000, response: { response: { responseFormat: 'text' } } }
      },
      id: 'n4', name: 'Fetch Website', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [660, 0],
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: extractCode },
      id: 'n5', name: 'Extract', type: 'n8n-nodes-base.code', typeVersion: 2, position: [880, 0]
    },
    {
      parameters: {
        method: 'POST', url: 'https://api.anthropic.com/v1/messages',
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
        sendBody: true, specifyBody: 'json',
        jsonBody: "={{ JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 800, messages: [{ role: 'user', content: $json.prompt }] }) }}"
      },
      id: 'n6', name: 'Claude Score and Draft', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1100, 0],
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: formatCode },
      id: 'n7', name: 'Format', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1320, 0]
    },
    {
      parameters: {
        method: 'POST', url: callbackUrl,
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json) }}'
      },
      id: 'n8', name: 'Send Results to Backend', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1540, 0]
    }
  ],
  connections: {
    'Webhook': { main: [[{ node: 'Google Places Search', type: 'main', index: 0 }]] },
    'Google Places Search': { main: [[{ node: 'Prepare', type: 'main', index: 0 }]] },
    'Prepare': { main: [[{ node: 'Fetch Website', type: 'main', index: 0 }]] },
    'Fetch Website': { main: [[{ node: 'Extract', type: 'main', index: 0 }]] },
    'Extract': { main: [[{ node: 'Claude Score and Draft', type: 'main', index: 0 }]] },
    'Claude Score and Draft': { main: [[{ node: 'Format', type: 'main', index: 0 }]] },
    'Format': { main: [[{ node: 'Send Results to Backend', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

fs.mkdirSync('n8n', { recursive: true });
fs.writeFileSync('n8n/lead-finder.workflow.json', JSON.stringify(workflow, null, 2));
console.log('written');
