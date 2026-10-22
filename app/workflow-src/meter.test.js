// Tests of what the workflows report spending (calls and tokens), for the admin's statistics. They run the code that is
// actually shipped (n8n/*.workflow.json), with stand-ins for n8n's $ helpers.   Run: node --test workflow-src/meter.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { build, run } = require('./harness');

const lead = { name: 'Salon', address: 'Rue 1', score: 7, phone: '+216 1', emails: [], social: [] };
const skipped = { error: { message: 'the call went to an invalid address' } };

test('a search reports the requests that really answered and the tokens of the AI check', () => {
  const workflow = build('build-workflow.js', 'lead-finder.workflow.json');
  const out = run(workflow, 'Format', {
    body: { jobId: 5 }, input: [lead],
    outputs: {
      'Maps Search': [{ searchParameters: { q: 'gyms' } }],
      'Web Search': [{ searchParameters: {} }, { searchParameters: {} }, skipped],
      'Geoapify Places': [skipped],
      'AI Check': [{ usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 50 } }, skipped],
    },
  })[0].json;
  assert.equal(out.jobId, 5);
  assert.equal(out.leads.length, 1);
  assert.deepEqual(out.meter, {
    gemini: { calls: 1, inputTokens: 1000, outputTokens: 250 },
    serper: { calls: 3 },
    geoapify: { calls: 0 },
  });
});

test('geocoding and the Geoapify places count when they answered, and a node that did not run counts for nothing', () => {
  const workflow = build('build-workflow.js', 'lead-finder.workflow.json');
  const withGeo = run(workflow, 'Format', {
    body: { jobId: 1 }, input: [lead],
    outputs: { 'Geocode City': [{ results: [{ lat: 1, lon: 2 }] }], 'Geoapify Places': [{ type: 'FeatureCollection', features: [] }], 'Maps Search': [{ searchParameters: {} }] },
  })[0].json;
  assert.equal(withGeo.meter.geoapify.calls, 2);
  assert.equal(withGeo.meter.serper.calls, 1);
  assert.deepEqual(withGeo.meter.gemini, { calls: 0, inputTokens: 0, outputTokens: 0 }, 'no AI check ran');

  // a drawn area has no geocoding step at all
  const drawn = run(workflow, 'Format', { body: { jobId: 2, bbox: '1,2,3,4' }, input: [lead], outputs: {} })[0].json;
  assert.deepEqual(drawn.meter, { gemini: { calls: 0, inputTokens: 0, outputTokens: 0 }, serper: { calls: 0 }, geoapify: { calls: 0 } });
});

test('the contact lookup reports its one Serper search only when it answered', () => {
  const workflow = build('build-enrich-workflow.js', 'enrich-contact.workflow.json');
  const base = { body: { leadName: 'Salon', address: 'Rue 1', niche: 'salon', city: 'Tunis' }, input: [{ data: '' }] };
  const pick = { fetchUrl: null, needsVerify: false, results: 3, sources: [] };
  const answered = run(workflow, 'Collect', { ...base, outputs: { 'Pick Candidates': [pick], 'Fetch Site': [{ data: '' }], 'Serper Search': [{ searchParameters: { q: 'x' } }] } })[0].json;
  assert.deepEqual(answered.meter, { serper: { calls: 1 } });
  const failed = run(workflow, 'Collect', { ...base, outputs: { 'Pick Candidates': [pick], 'Fetch Site': [{ data: '' }], 'Serper Search': [skipped] } })[0].json;
  assert.deepEqual(failed.meter, { serper: { calls: 0 } });
});
