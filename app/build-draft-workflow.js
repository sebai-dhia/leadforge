// Generates n8n/draft-message.workflow.json (run: node build-draft-workflow.js)
// Flow: Webhook -> Plan Fetch -> Fetch Pages -> Build Prompt -> AI Write (fast model, then fallbacks) -> Check -> (AI Retry) -> Finalize -> Respond.
// The Code nodes live as real files in workflow-src/draft/ so they can be checked and tested.
// The backend waits for the reply. Facts come only from the sender's profile, the lead, and pages read here.
const fs = require('fs');
const { SAFE_URL } = require('./workflow-snippets');
const { withDeployIds } = require('./n8n-deploy-ids');
const prompts = require('./prompts-lib');

// The prompt text, examples, limits and model settings are data in prompts/draft/. Every change there is a new version.
const DRAFT = prompts.load('draft');

const src = name => fs.readFileSync(__dirname + '/workflow-src/draft/' + name + '.js', 'utf8').trim();
const url = model => 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
// the fast model first, then fallbacks with longer timeouts: when one is overloaded or out of quota, the next one answers
const CFG = DRAFT.data.config;
const MODELS = [{ model: CFG.model, timeoutMs: CFG.timeoutMs || 15000, tries: CFG.tries || 2 }, ...(CFG.fallbacks || [])];
if (MODELS.length > 3) throw new Error('the draft workflow has room for 3 models (shared.js lists the attempts)');
const AI_NAMES = ['AI Write Message', 'AI Write B', 'AI Write C'];
/** True when an earlier attempt already gave a reply with text, so this one is skipped. */
const answered = names => names.map(n => "((($('" + n + "').first().json.candidates || [])[0] || {}).content?.parts?.[0]?.text || '').length > 20").join(' || ');

const planCode = SAFE_URL + '\n' + src('plan');
const promptCode = prompts.embed(DRAFT) + '\n' + src('prompt');
const checkCode = src('shared') + '\n' + src('check');
const finalizeCode = src('shared') + '\n' + src('finalize');

/** The request body shared by the first try and the second try: fixed instructions apart from the facts. */
const geminiBody = text => "={{ JSON.stringify({ systemInstruction: { parts: [{ text: $('Build Prompt').first().json.system }] }, "
  + "contents: [{ role: 'user', parts: [{ text: " + text + " }] }], "
  + "generationConfig: { responseMimeType: 'application/json', temperature: " + DRAFT.data.config.temperature + ", maxOutputTokens: " + DRAFT.data.config.maxOutputTokens + " } }) }}";

const workflow = {
  name: 'Lead Finder Draft Message',
  nodes: [
    {
      parameters: { httpMethod: 'POST', path: 'draft-message', authentication: 'headerAuth', responseMode: 'responseNode', options: {} },
      id: 'd1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
      webhookId: 'draft-message-backend'
    },
    {
      parameters: { jsCode: planCode },
      id: 'd6', name: 'Plan Fetch', type: 'n8n-nodes-base.code', typeVersion: 2, position: [200, 0]
    },
    {
      parameters: {
        url: "={{ $json.url || 'http://invalid.invalid/' }}",
        options: { timeout: 6000, response: { response: { responseFormat: 'text' } }, batching: { batch: { batchSize: 5, batchInterval: 0 } } }
      },
      id: 'd7', name: 'Fetch Pages', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [400, 0],
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: promptCode },
      id: 'd2', name: 'Build Prompt', type: 'n8n-nodes-base.code', typeVersion: 2, position: [600, 0]
    },
    ...MODELS.map((m, i) => ({
      parameters: {
        method: 'POST',
        url: i === 0 ? url(m.model) : "={{ (" + answered(AI_NAMES.slice(0, i)) + ") ? 'http://invalid.invalid/' : '" + url(m.model) + "' }}",
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: geminiBody("$('Build Prompt').first().json.prompt"),
        options: { timeout: m.timeoutMs }
      },
      id: 'd' + (3 + i * 10), name: AI_NAMES[i], type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [800 + i * 200, 0],
      // the free tier answers 429 when asked too fast and 503 when busy: ask again after a short wait (n8n needs 2 or more tries)
      ...(m.tries > 1 ? { retryOnFail: true, maxTries: m.tries, waitBetweenTries: 3000 } : {}),
      onError: 'continueRegularOutput'
    })),
    {
      parameters: { jsCode: checkCode },
      id: 'd8', name: 'Check', type: 'n8n-nodes-base.code', typeVersion: 2, position: [800 + MODELS.length * 200, 0]
    },
    {
      parameters: {
        method: 'POST',
        url: "={{ $json.retryPrompt ? " + JSON.stringify(MODELS.map(m => url(m.model))) + "[$json.modelIndex || 0] : 'http://invalid.invalid/' }}",
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: geminiBody("$json.retryPrompt || ''"),
        options: { timeout: 25000 }
      },
      id: 'd9', name: 'AI Retry', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1000 + MODELS.length * 200, 0],
      retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: finalizeCode },
      id: 'd4', name: 'Finalize', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1200 + MODELS.length * 200, 0]
    },
    {
      parameters: {
        respondWith: 'json', responseBody: '={{ $json }}',
        options: { responseCode: '={{ $json.error ? 502 : 200 }}' }
      },
      id: 'd5', name: 'Respond', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1400 + MODELS.length * 200, 0]
    }
  ],
  connections: {
    'Webhook': { main: [[{ node: 'Plan Fetch', type: 'main', index: 0 }]] },
    'Plan Fetch': { main: [[{ node: 'Fetch Pages', type: 'main', index: 0 }]] },
    'Fetch Pages': { main: [[{ node: 'Build Prompt', type: 'main', index: 0 }]] },
    'Build Prompt': { main: [[{ node: 'AI Write Message', type: 'main', index: 0 }]] },
    ...Object.fromEntries(MODELS.map((m, i) => [AI_NAMES[i], { main: [[{ node: i + 1 < MODELS.length ? AI_NAMES[i + 1] : 'Check', type: 'main', index: 0 }]] }])),
    'Check': { main: [[{ node: 'AI Retry', type: 'main', index: 0 }]] },
    'AI Retry': { main: [[{ node: 'Finalize', type: 'main', index: 0 }]] },
    'Finalize': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

fs.mkdirSync('n8n', { recursive: true });
fs.writeFileSync('n8n/draft-message.workflow.json', JSON.stringify(withDeployIds(workflow), null, 2));
console.log('written');
