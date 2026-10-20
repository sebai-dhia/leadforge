// Golden files: exactly what the prompt-building nodes produced for the fixtures. A refactor must not change them.
//   node workflow-src/golden.js                  record what the current code produces (an intended improvement)
//   node workflow-src/golden.js --from-git HEAD  record what the code of a commit produced (the proof for a refactor:
//                                                the new code must then pass golden.test.js unchanged)
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { build, run, root } = require('./harness');
const { draftCases, fitCases } = require('./fixtures');

const FILE = name => path.join(__dirname, 'golden', name + '.json');

/** A workflow as it was committed at a git ref, for recording what older code produced. */
function workflowAt(ref, jsonFile) {
  const out = execFileSync('git', ['show', ref + ':app/n8n/' + jsonFile], { cwd: root, maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(out.toString());
}

function draftOutputs(ref) {
  const wf = ref ? workflowAt(ref, 'draft-message.workflow.json') : build('build-draft-workflow.js', 'draft-message.workflow.json');
  return Object.fromEntries(draftCases.map(c => [c.name, run(wf, 'Build Prompt', { body: c.body, outputs: { 'Plan Fetch': c.plan }, input: c.pages })[0].json]));
}

function fitOutputs(ref) {
  const wf = ref ? workflowAt(ref, 'lead-finder.workflow.json') : build('build-workflow.js', 'lead-finder.workflow.json');
  return Object.fromEntries(fitCases.map(c => [c.name, run(wf, 'AI Prompt', { body: c.body, input: c.input })[0].json]));
}

if (require.main === module) {
  fs.mkdirSync(path.join(__dirname, 'golden'), { recursive: true });
  const i = process.argv.indexOf('--from-git');
  const ref = i > 0 ? process.argv[i + 1] : null;
  fs.writeFileSync(FILE('draft'), JSON.stringify(draftOutputs(ref), null, 2) + '\n');
  fs.writeFileSync(FILE('fit'), JSON.stringify(fitOutputs(ref), null, 2) + '\n');
  console.log('golden files written from', ref ? 'git ' + ref : 'the current code');
}

module.exports = { draftOutputs, fitOutputs, FILE };
