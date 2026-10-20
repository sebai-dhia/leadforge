#!/usr/bin/env node
// Measures how well the message prompt works, so a change to a prompt can be judged by numbers and not by feeling.
// It sends fixed, invented cases (workflow-src/eval-cases.json) straight to the n8n draft webhook, several times each.
// It does not use anyone's daily draft limit and touches no account. It costs a few free-tier AI calls.
//
//   node tools/draft-eval.js [--runs 3] [--pace 4500] [--label name] [--show]     measure the prompt that is deployed now
//   (--pace is the pause in milliseconds between requests: the free AI tier allows about 15 a minute and answers 429 above that)
//   node tools/draft-eval.js --compare eval-results/a.json eval-results/b.json
//
// Numbers (a change is good when "first try" and "consistent" go up, "copies the example" and "alike" go down):
//   first try      messages that passed every rule at the first attempt (the checker names the rules; see workflow-src/draft/shared.js)
//   final          messages that passed after the second try, if one was needed
//   copies example share of the message's 4-word sequences that also appear in the prompt's example (the AI repeating the example)
//   alike          how similar messages for DIFFERENT businesses in the same language are (high = formulaic)
//   consistent     how similar messages for the SAME business are across repeats (high = reproducible)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

// ---------------------------------------------------------------- text measures
const tokens = s => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const grams = (s, n = 4) => { const t = tokens(s), out = new Set(); for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n).join(' ')); return out; };
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let x = 0; for (const g of a) if (b.has(g)) x++; return x / (a.size + b.size - x); };
const share = (a, b) => { if (!a.size) return 0; let x = 0; for (const g of a) if (b.has(g)) x++; return x / a.size; };
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const pct = x => Math.round(100 * x) + '%';
const percentile = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };

function summarize(runs, examples) {
  const ok = runs.filter(r => !r.error);
  const copy = ok.map(r => share(grams(r.body), grams((examples[r.language] || {})[r.channel]?.body || '')));
  const cross = [], same = [];
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
    const a = ok[i], b = ok[j];
    const sim = jaccard(grams(a.body), grams(b.body));
    if (a.case === b.case) same.push(sim); else if (a.language === b.language) cross.push(sim);
  }
  const problems = {};
  for (const r of ok) for (const p of r.firstProblems) { const k = p.replace(/\d+/g, 'N'); problems[k] = (problems[k] || 0) + 1; }
  return {
    runs: runs.length, errors: runs.length - ok.length,
    firstTry: ok.length ? ok.filter(r => r.attempts === 1).length / ok.length : 0,
    final: ok.length ? ok.filter(r => r.finalProblems.length === 0).length / ok.length : 0,
    attempts: mean(ok.map(r => r.attempts)),
    msP50: percentile(ok.map(r => r.ms), 0.5), msP95: percentile(ok.map(r => r.ms), 0.95),
    words: mean(ok.map(r => r.words)),
    copiesExample: mean(copy), alike: mean(cross), consistent: mean(same),
    problems: Object.entries(problems).sort((a, b) => b[1] - a[1]).slice(0, 6),
  };
}

function print(s, title) {
  console.log(`\n${title}`);
  console.log(`  messages           ${s.runs} (${s.errors} failed)`);
  console.log(`  first try          ${pct(s.firstTry)}   (average attempts ${s.attempts.toFixed(2)})`);
  console.log(`  final              ${pct(s.final)}`);
  console.log(`  speed              median ${(s.msP50 / 1000).toFixed(1)} s, slowest 5% ${(s.msP95 / 1000).toFixed(1)} s`);
  console.log(`  length             ${s.words.toFixed(0)} words on average`);
  console.log(`  copies example     ${pct(s.copiesExample)}`);
  console.log(`  alike              ${pct(s.alike)}   (different businesses, same language)`);
  console.log(`  consistent         ${pct(s.consistent)}   (same business, repeated)`);
  if (s.problems.length) console.log('  first-try problems ' + s.problems.map(([p, n]) => `${n}x ${p}`).join('; '));
}

// ---------------------------------------------------------------- compare mode
if (args[0] === '--compare') {
  const [a, b] = [args[1], args[2]].map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
  const row = (label, key, fmt, better) => {
    const x = a.summary[key], y = b.summary[key];
    const d = y - x;
    const mark = Math.abs(d) < 1e-9 ? '' : ((better === 'up') === (d > 0) ? '  better' : '  worse');
    console.log(`  ${label.padEnd(16)} ${fmt(x).padStart(8)}  ->  ${fmt(y).padStart(8)}${mark}`);
  };
  console.log(`\nComparing ${a.version} (${a.label})  ->  ${b.version} (${b.label})   [${a.summary.runs} and ${b.summary.runs} messages]`);
  row('first try', 'firstTry', pct, 'up');
  row('final', 'final', pct, 'up');
  row('median seconds', 'msP50', v => (v / 1000).toFixed(1), 'down');
  row('words', 'words', v => v.toFixed(0), 'down');
  row('copies example', 'copiesExample', pct, 'down');
  row('alike', 'alike', pct, 'down');
  row('consistent', 'consistent', pct, 'up');
  process.exit(0);
}

// ---------------------------------------------------------------- measuring
const envFile = path.join(root, '.env');
const env = fs.existsSync(envFile) ? Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()])) : {};
const URL = process.env.N8N_DRAFT_URL || 'http://localhost:5678/webhook/draft-message';
const SECRET = process.env.N8N_WEBHOOK_SECRET || env.N8N_WEBHOOK_SECRET || 'dev-webhook-secret';
const RUNS = Number(flag('--runs') || 3);
const LABEL = flag('--label') || new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const SHOW = args.includes('--show');
const PACE = Number(flag('--pace') || 4500);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const examples = JSON.parse(fs.readFileSync(path.join(root, 'prompts', 'draft', 'examples.json'), 'utf8'));
const spec = JSON.parse(fs.readFileSync(path.join(root, 'workflow-src', 'eval-cases.json'), 'utf8'));

async function ask(payload) {
  const t0 = Date.now();
  const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Webhook-Secret': SECRET }, body: JSON.stringify(payload), signal: AbortSignal.timeout(90000) });
  const ms = Date.now() - t0;
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ms, j };
}

(async () => {
  const runs = [];
  let version = '?';
  for (const c of spec.cases) {
    for (let n = 1; n <= RUNS; n++) {
      const payload = { ...spec.senders[c.sender], ...c.lead, language: c.language, channel: c.channel, debug: true };
      let res;
      try { res = await ask(payload); } catch (e) { res = { status: 0, ms: 0, j: { message: e.message } }; }
      await sleep(PACE);
      const j = res.j || {};
      const base = { case: c.name, run: n, language: c.language, channel: c.channel, ms: res.ms };
      if (res.status !== 200 || !j.body) { runs.push({ ...base, error: j.message || 'HTTP ' + res.status }); console.log(`${c.name} #${n}: FAILED (${j.message || 'HTTP ' + res.status})`); continue; }
      version = j.promptVersion || version;
      const d = j.debug || {};
      const rec = { ...base, subject: j.subject, body: j.body, words: tokens(j.body).length, attempts: d.attempts || 1, firstProblems: d.firstProblems || [], finalProblems: d.finalProblems || [], angle: d.angle, firstBody: d.attempts === 2 ? d.firstBody : undefined };
      runs.push(rec);
      console.log(`${c.name.padEnd(36)} #${n} ${(res.ms / 1000).toFixed(1)}s  ${rec.attempts === 1 ? 'ok first try' : 'second try: ' + rec.firstProblems.join('; ')}${rec.finalProblems.length ? '  STILL: ' + rec.finalProblems.join('; ') : ''}`);
      if (SHOW) console.log(rec.subject ? 'Subject: ' + rec.subject + '\n' + rec.body + '\n' : rec.body + '\n');
    }
  }
  const summary = summarize(runs, examples);
  print(summary, `Prompt ${version}`);
  const dir = path.join(root, 'eval-results');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `draft-${version}-${LABEL}.json`);
  fs.writeFileSync(file, JSON.stringify({ version, label: LABEL, at: new Date().toISOString(), summary, runs }, null, 2));
  console.log('\nSaved ' + path.relative(root, file));
})().catch(e => { console.error(e.message); process.exit(1); });
