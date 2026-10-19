// Generates n8n/draft-message.workflow.json (run: node build-draft-workflow.js)
// Flow: Webhook -> Build Prompt -> Gemini -> Parse -> Respond. The backend waits for the reply.
const fs = require('fs');
const { withDeployIds } = require('./n8n-deploy-ids');

const promptCode = `
const b = $json.body || {};
const languages = {
  en: 'English',
  fr: 'French',
  ar: 'Arabic (Modern Standard Arabic, simple, polite and natural to read)'
};
const lang = languages[b.language] || languages.en;
const wa = b.channel === 'whatsapp';
const facts = [
  'Business: ' + b.leadName,
  b.address ? 'Address: ' + b.address : null,
  (b.niche && b.city) ? 'Category and city: ' + b.niche + ' in ' + b.city : null,
  b.website ? 'Website: ' + b.website : 'No website is listed for this business.',
  b.reason ? 'Why it may be a fit: ' + b.reason : null
].filter(Boolean).join('\\n');
const prompt = [
  'You write one short first-contact message from a freelancer to a local business.',
  'Sender name: ' + b.senderName,
  'What the sender offers: ' + b.offer,
  '',
  'Business facts (the ONLY facts you may use):',
  facts,
  '',
  'Language: write the whole message in ' + lang + '.',
  wa
    ? 'Channel: WhatsApp. Body of at most 60 words, friendly and conversational, no subject, no formal sign-off block.'
    : 'Channel: email. Subject of at most 8 words and a body of at most 90 words.',
  '',
  'Rules:',
  '- Never claim that you noticed, saw, visited or reviewed anything.',
  '- Never state that the business lacks a website, booking system or any tool. You may say you could not find one online, or ask whether they use one.',
  '- Do not guess a person name. Greet with only a greeting word and a comma, such as Hello, or Bonjour, on its own line. Never put the business name in the greeting.',
  '- Say nothing about the sender except the name and what they offer. Do not say where they are based or add experience, clients or credentials.',
  '- Use the business name exactly as written. Do not add titles such as Dr or Maitre and do not assume anyone gender.',
  '- No numbers, statistics, guarantees or exaggerated claims.',
  '- End with one low-pressure question, then sign with the sender name.',
  '',
  'Reply with ONLY JSON: {"subject":string,"body":string}. The subject must be an empty string for WhatsApp.'
].join('\\n');
return [{ json: { prompt } }];
`.trim();

const parseCode = `
const channel = (($('Webhook').first().json.body) || {}).channel;
let out = null;
try {
  const raw = ($json.candidates && $json.candidates[0].content.parts.map(p => p.text || '').join('')) || '';
  const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  if (o && typeof o.body === 'string' && o.body.trim()) {
    out = { subject: channel === 'whatsapp' ? '' : String(o.subject || '').trim(), body: o.body.trim() };
  }
} catch (e) { /* falls through to the error result */ }
return [{ json: out || { error: true, message: 'The AI did not return a usable message' } }];
`.trim();

const workflow = {
  name: 'Lead Finder Draft Message',
  nodes: [
    {
      parameters: { httpMethod: 'POST', path: 'draft-message', authentication: 'headerAuth', responseMode: 'responseNode', options: {} },
      id: 'd1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
      webhookId: 'draft-message-backend'
    },
    {
      parameters: { jsCode: promptCode },
      id: 'd2', name: 'Build Prompt', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0]
    },
    {
      parameters: {
        method: 'POST',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: "={{ JSON.stringify({ contents: [{ parts: [{ text: $json.prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.6, maxOutputTokens: 700 } }) }}"
      },
      id: 'd3', name: 'AI Write Message', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 0],
      retryOnFail: true, maxTries: 2, waitBetweenTries: 2000,
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: parseCode },
      id: 'd4', name: 'Parse', type: 'n8n-nodes-base.code', typeVersion: 2, position: [660, 0]
    },
    {
      parameters: {
        respondWith: 'json', responseBody: '={{ $json }}',
        options: { responseCode: '={{ $json.error ? 502 : 200 }}' }
      },
      id: 'd5', name: 'Respond', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [880, 0]
    }
  ],
  connections: {
    'Webhook': { main: [[{ node: 'Build Prompt', type: 'main', index: 0 }]] },
    'Build Prompt': { main: [[{ node: 'AI Write Message', type: 'main', index: 0 }]] },
    'AI Write Message': { main: [[{ node: 'Parse', type: 'main', index: 0 }]] },
    'Parse': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

fs.mkdirSync('n8n', { recursive: true });
fs.writeFileSync('n8n/draft-message.workflow.json', JSON.stringify(withDeployIds(workflow), null, 2));
console.log('written');
