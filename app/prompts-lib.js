// Prompts as versioned data. Each folder in prompts/ is one prompt: templates (.md), data (.json) and a config.json
// that declares the variables every template may use. This file loads a folder, checks it, and gives it a version:
// a hash of everything in it, so any change to the text, an example or a setting is a new version.
//   node prompts-lib.js        checks every prompt and prints its version
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, 'prompts');
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** Same text on every machine: no carriage returns, no final line break. */
const normalize = s => s.replace(/\r\n/g, '\n').replace(/\n$/, '');
const placeholders = text => new Set([...String(text).matchAll(PLACEHOLDER)].map(m => m[1]));

/** JSON with sorted keys, so the version does not depend on how a file orders its keys. */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach(x => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach(x => strings(x, out));
  return out;
}

/** Problems with a prompt folder, as sentences. Empty when it is sound. */
function validate(name, templates, data) {
  const errors = [];
  const config = data.config;
  if (!config || !config.variables) return [name + ': config.json with a "variables" section is required'];

  for (const [base, text] of Object.entries(templates)) {
    const declared = config.variables[base];
    if (!declared) { errors.push(`${name}/${base}.md: no variables declared in config.json`); continue; }
    const used = placeholders(text);
    for (const v of used) if (!declared.includes(v)) errors.push(`${name}/${base}.md uses {{${v}}}, which config.json does not declare`);
    for (const v of declared) if (!used.has(v)) errors.push(`${name}/${base}.md never uses the declared variable {{${v}}}`);
  }

  // placeholders inside data: a data file may use the variables declared under its own name,
  // and the "channels" part of config.json those declared under "channels"
  const scopes = [...Object.entries(data).filter(([base]) => base !== 'config').map(([base, v]) => [base, v, config.variables[base] || []])];
  if (config.channels) scopes.push(['config.channels', config.channels, config.variables.channels || []]);
  for (const [label, value, allowed] of scopes) {
    for (const s of strings(value)) for (const v of placeholders(s)) {
      if (!allowed.includes(v)) errors.push(`${name}/${label} uses {{${v}}}, which config.json does not declare for it`);
    }
  }
  // everywhere else in config.json a placeholder is a mistake
  const rest = { ...config };
  delete rest.channels;
  delete rest.variables;
  for (const s of strings(rest)) if (placeholders(s).size) errors.push(`${name}/config.json: "${s.slice(0, 40)}" has a placeholder; only "channels" may`);
  if (typeof config.temperature !== 'number' || config.temperature < 0 || config.temperature > 1) errors.push(`${name}: temperature must be between 0 and 1`);
  if (!config.model) errors.push(`${name}: model is required`);
  if (validators[name]) errors.push(...validators[name](data));
  return errors;
}

const validators = {
  draft(data) {
    const errors = [];
    const { languages, channels } = data.config;
    for (const lang of Object.keys(languages)) {
      for (const ch of Object.keys(channels)) {
        for (const situation of ['nosite', 'website', 'other']) {
          const ex = data.examples[lang] && data.examples[lang][ch] && data.examples[lang][ch][situation];
          if (!ex || !ex.body || !ex.body.trim()) errors.push(`draft/examples.json: no example for ${lang} / ${ch} / ${situation}`);
          else if (ch === 'email' && !ex.subject) errors.push(`draft/examples.json: the ${lang} email example for ${situation} needs a subject`);
        }
      }
    }
    for (const [ch, c] of Object.entries(channels)) {
      if (!Number.isInteger(c.words) || c.words < 20 || c.words > 300) errors.push(`draft: words for ${ch} must be a whole number from 20 to 300`);
    }
    const tiers = data.facts.reputation;
    if (tiers.some((t, i) => i > 0 && t.minReviews >= tiers[i - 1].minReviews)) errors.push('draft/facts.json: reputation tiers must go from most to fewest reviews');
    return errors;
  },
  fit(data) {
    const parts = data.lead.parts || [];
    return parts.length ? [] : ['fit/lead.json: parts is empty'];
  },
};

function load(name, root = ROOT) {
  const dir = path.join(root, name);
  const files = fs.readdirSync(dir).sort();
  const templates = {};
  const data = {};
  const digest = crypto.createHash('sha256');
  for (const f of files) {
    const base = path.basename(f, path.extname(f));
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    if (f.endsWith('.md')) {
      templates[base] = normalize(text);
      digest.update(f + '\n' + templates[base] + '\n---\n');
    } else if (f.endsWith('.json')) {
      data[base] = JSON.parse(text);
      digest.update(f + '\n' + stable(data[base]) + '\n---\n');
    }
  }
  const errors = validate(name, templates, data);
  if (errors.length) throw new Error('Prompt "' + name + '" is not valid:\n- ' + errors.join('\n- '));
  return { name, version: name + '-' + digest.digest('hex').slice(0, 8), templates, data };
}

/** What a Code node needs: the prompt itself, and render(), which refuses a variable that was not given. */
const RUNTIME = String.raw`
// Prompt text lives in prompts/<name>/ in the repository and is embedded here. render() fills {{variables}}
// and stops with a clear error when one is missing, instead of sending a broken prompt to the AI.
const render = (template, vars) => String(template).replace(/\{\{(\w+)\}\}/g, (m, k) => {
  if (!Object.prototype.hasOwnProperty.call(vars, k)) throw new Error('prompt variable missing: ' + k + ' (' + PROMPTS.version + ')');
  return String(vars[k]);
});`;

function embed(prompt) {
  const { version, templates, data } = prompt;
  return 'const PROMPTS = ' + JSON.stringify({ version, templates, data }) + ';' + RUNTIME;
}

function all() {
  return fs.readdirSync(ROOT).filter(d => fs.statSync(path.join(ROOT, d)).isDirectory()).sort().map(n => load(n));
}

module.exports = { load, embed, all, validate, normalize, placeholders };

if (require.main === module) {
  for (const p of all()) console.log(p.version, '-', Object.keys(p.templates).length, 'templates,', Object.keys(p.data).length, 'data files');
}
