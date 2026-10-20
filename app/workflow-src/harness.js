// Runs one Code node of a generated workflow outside n8n, with stand-ins for n8n's $ helpers.
// The nodes are the code that actually ships (n8n/*.workflow.json), so tests see what n8n will run.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');

/** Rebuilds a workflow from its builder (so tests never look at a stale file) and loads it. */
function build(builder, jsonFile) {
  execFileSync('node', [builder], { cwd: root });
  delete require.cache[require.resolve(path.join(root, 'n8n', jsonFile))];
  return require(path.join(root, 'n8n', jsonFile));
}

/** outputs: what earlier nodes produced, by node name. input: the items arriving at this node. */
function run(workflow, name, { body, outputs = {}, input = [] }) {
  const code = workflow.nodes.find(n => n.name === name).parameters.jsCode;
  const all = {
    Webhook: [{ json: { body } }],
    ...Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, v.map(json => ({ json }))])),
  };
  const $ = n => ({ first: () => all[n][0], all: () => all[n] });
  const $input = { first: () => ({ json: input[0] }), all: () => input.map(json => ({ json })) };
  return new Function('$', '$input', '$json', '$getWorkflowStaticData', code)($, $input, input[0], () => ({}));
}

module.exports = { build, run, root };
