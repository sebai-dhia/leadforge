// The prompts must come out exactly as the golden files say. Moving text into prompts/ was a refactor: nothing may change.
// Fields added since (such as promptVersion) are not in the golden files and are not compared.
// An intended change is recorded on purpose with:  node workflow-src/golden.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { draftOutputs, fitOutputs, FILE } = require('./golden');

const golden = name => JSON.parse(fs.readFileSync(FILE(name), 'utf8'));

function same(actual, expectedAll, label) {
  for (const [name, expected] of Object.entries(expectedAll)) {
    for (const key of Object.keys(expected)) {
      assert.deepEqual(actual[name][key], expected[key], `${label} / ${name}: "${key}" changed`);
    }
  }
}

test('the draft prompts are identical to the golden files', () => same(draftOutputs(), golden('draft'), 'draft'));
test('the fit prompts are identical to the golden files', () => same(fitOutputs(), golden('fit'), 'fit'));
