// Tests of the prompt loader: validation of variables, versions, and the strict render() the Code nodes use.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const prompts = require('../prompts-lib');

/** A copy of a real prompt folder in a temporary place, so a test can break it. */
function broken(name, change) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompts-'));
  const from = path.join(__dirname, '..', 'prompts', name);
  const target = path.join(dir, name);
  fs.cpSync(from, target, { recursive: true });
  change(target);
  return { dir, load: () => {
    // the loader reads from prompts/ next to prompts-lib.js, so validate the copy directly
    const templates = {}, data = {};
    for (const f of fs.readdirSync(target)) {
      const base = path.basename(f, path.extname(f));
      const text = fs.readFileSync(path.join(target, f), 'utf8');
      if (f.endsWith('.md')) templates[base] = prompts.normalize(text); else if (f.endsWith('.json')) data[base] = JSON.parse(text);
    }
    return prompts.validate(name, templates, data);
  } };
}

test('the real prompts are valid and have a version', () => {
  const all = prompts.all();
  assert.deepEqual(all.map(p => p.name), ['draft', 'fit']);
  for (const p of all) assert.match(p.version, new RegExp('^' + p.name + '-[0-9a-f]{8}$'));
});

test('a template that uses a variable config.json does not declare is refused', () => {
  const b = broken('draft', d => fs.appendFileSync(path.join(d, 'system.md'), '\nExtra {{surprise}}\n'));
  assert.ok(b.load().some(e => /uses \{\{surprise\}\}/.test(e)));
});

test('a declared variable that no template uses is refused', () => {
  const b = broken('draft', d => {
    const f = path.join(d, 'config.json');
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    c.variables.system.push('never_used');
    fs.writeFileSync(f, JSON.stringify(c));
  });
  assert.ok(b.load().some(e => /never uses the declared variable \{\{never_used\}\}/.test(e)));
});

test('a language or channel without an example, and a wrong word limit, are refused', () => {
  const b = broken('draft', d => {
    const ex = JSON.parse(fs.readFileSync(path.join(d, 'examples.json'), 'utf8'));
    delete ex.ar.email.nosite;
    fs.writeFileSync(path.join(d, 'examples.json'), JSON.stringify(ex));
    const c = JSON.parse(fs.readFileSync(path.join(d, 'config.json'), 'utf8'));
    c.channels.email.words = 5000;
    fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify(c));
  });
  const errors = b.load();
  assert.ok(errors.some(e => /no example for ar \/ email/.test(e)), JSON.stringify(errors));
  assert.ok(errors.some(e => /words for email/.test(e)));
});

test('the version changes with the text, an example or a setting, and not with line endings', () => {
  // a temporary copy: a test must never touch the real prompt files (other tests read them at the same time)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prompts-version-'));
  fs.cpSync(path.join(__dirname, '..', 'prompts', 'draft'), path.join(root, 'draft'), { recursive: true });
  const file = path.join(root, 'draft', 'system.md');
  const original = fs.readFileSync(file, 'utf8');
  const base = prompts.load('draft', root).version;
  assert.equal(base, prompts.load('draft').version, 'the copy has the same version as the real files');
  fs.writeFileSync(file, original.replace(/\n/g, '\r\n'));
  assert.equal(prompts.load('draft', root).version, base, 'CRLF is the same text');
  fs.writeFileSync(file, original.replace('copywriter', 'copy writer'));
  assert.notEqual(prompts.load('draft', root).version, base, 'a changed word is a new version');
  fs.writeFileSync(file, original);
  const cfg = path.join(root, 'draft', 'config.json');
  const c = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  c.temperature = 0.5;
  fs.writeFileSync(cfg, JSON.stringify(c));
  assert.notEqual(prompts.load('draft', root).version, base, 'a changed setting is a new version');
});

test('render() fills variables and refuses a missing one, naming the version', () => {
  const p = prompts.load('draft');
  const render = new Function('PROMPTS', prompts.embed(p).replace(/^const PROMPTS = .*?;\n\/\/ Prompt text/s, '// Prompt text') + '\nreturn render;')(p);
  assert.equal(render('Hello {{name}}!', { name: 'there' }), 'Hello there!');
  assert.equal(render('Total {{n}}', { n: 3 }), 'Total 3');
  assert.throws(() => render('Hello {{name}}', {}), /prompt variable missing: name \(draft-[0-9a-f]{8}\)/);
  assert.equal(render('Keep $& and {{x}}', { x: '$1' }), 'Keep $& and $1', 'values are never treated as patterns');
});
