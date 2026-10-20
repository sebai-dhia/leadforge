// Generates n8n/draft-message.workflow.json (run: node build-draft-workflow.js)
// Flow: Webhook -> Plan Fetch -> Fetch Pages -> Build Prompt -> AI Write -> Check -> (AI Retry) -> Finalize -> Respond.
// The Code nodes live as real files in workflow-src/draft/ so they can be checked and tested.
// The backend waits for the reply. Facts come only from the sender's profile, the lead, and pages read here.
const fs = require('fs');
const { SAFE_URL } = require('./workflow-snippets');
const { withDeployIds } = require('./n8n-deploy-ids');
const prompts = require('./prompts-lib');

// The prompt text, examples, limits and model settings are data in prompts/draft/. Every change there is a new version.
const DRAFT = prompts.load('draft');

const src = name => fs.readFileSync(__dirname + '/workflow-src/draft/' + name + '.js', 'utf8').trim();
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/' + DRAFT.data.config.model + ':generateContent';

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
    {
      parameters: {
        method: 'POST', url: GEMINI,
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: geminiBody('$json.prompt'),
        options: { timeout: 15000 }
      },
      id: 'd3', name: 'AI Write Message', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [800, 0],
      // the free AI tier answers 429 when asked too fast: wait and ask again (n8n allows up to 5 tries). A call that has not answered after 15 s is given up and asked again: a normal answer takes 1 to 3 s
      retryOnFail: true, maxTries: 4, waitBetweenTries: 4000,
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: checkCode },
      id: 'd8', name: 'Check', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1000, 0]
    },
    {
      parameters: {
        method: 'POST',
        url: "={{ $json.retryPrompt ? '" + GEMINI + "' : 'http://invalid.invalid/' }}",
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: geminiBody("$json.retryPrompt || ''"),
        options: { timeout: 15000 }
      },
      id: 'd9', name: 'AI Retry', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1200, 0],
      retryOnFail: true, maxTries: 3, waitBetweenTries: 4000,
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: finalizeCode },
      id: 'd4', name: 'Finalize', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1400, 0]
    },
    {
      parameters: {
        respondWith: 'json', responseBody: '={{ $json }}',
        options: { responseCode: '={{ $json.error ? 502 : 200 }}' }
      },
      id: 'd5', name: 'Respond', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1600, 0]
    }
  ],
  connections: {
    'Webhook': { main: [[{ node: 'Plan Fetch', type: 'main', index: 0 }]] },
    'Plan Fetch': { main: [[{ node: 'Fetch Pages', type: 'main', index: 0 }]] },
    'Fetch Pages': { main: [[{ node: 'Build Prompt', type: 'main', index: 0 }]] },
    'Build Prompt': { main: [[{ node: 'AI Write Message', type: 'main', index: 0 }]] },
    'AI Write Message': { main: [[{ node: 'Check', type: 'main', index: 0 }]] },
    'Check': { main: [[{ node: 'AI Retry', type: 'main', index: 0 }]] },
    'AI Retry': { main: [[{ node: 'Finalize', type: 'main', index: 0 }]] },
    'Finalize': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

fs.mkdirSync('n8n', { recursive: true });
fs.writeFileSync('n8n/draft-message.workflow.json', JSON.stringify(withDeployIds(workflow), null, 2));
console.log('written');
