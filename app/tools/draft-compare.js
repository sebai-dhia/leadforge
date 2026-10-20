// Writes the same few messages again and again so two versions of the draft workflow can be compared by eye.
// Usage: node tools/draft-compare.js <label>     (for example "before" or "after"; the output goes to draft-compare-<label>.json)
// It signs in as the admin with ADMIN_PASSWORD from app/.env, sets a test profile for the run and puts the original back.
// It spends draft limit and a few AI calls: about 6 messages per run.
const fs = require('fs');
const path = require('path');
const API = process.env.API || 'http://localhost:8081/api';
const label = process.argv[2] || 'run';
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));
const TEST_PROFILE = {
  headline: 'Web developer for local businesses',
  city: 'Tunis',
  about: 'I build simple websites and online booking tools for small shops.',
  services: ['Web development', 'Automation'],
  targets: ['Cafes', 'Restaurants'],
  links: [{ label: 'GitHub', url: 'https://github.com/vercel' }, { label: 'LinkedIn', url: 'https://www.linkedin.com/in/someone' }],
};
// lead name fragment, language, channel
const CASES = [['Power Gym', 'en', 'email'], ['Studio 4', 'fr', 'whatsapp'], ['Dental', 'fr', 'email'], ['Cesart', 'ar', 'whatsapp'], ['California', 'fr', 'whatsapp'], ['Hotel', 'en', 'whatsapp']];

(async () => {
  const j = async (method, url, token, body) => {
    const r = await fetch(API + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    return { status: r.status, json: text ? JSON.parse(text) : null };
  };
  const login = await j('POST', '/auth/login', null, { email: 'admin@leadforge.dev', password: env.ADMIN_PASSWORD });
  if (login.status !== 200) throw new Error('admin sign-in failed (' + login.status + '): is ADMIN_PASSWORD set in app/.env?');
  const t = login.json.token;
  const original = (await j('GET', '/profile', t)).json;
  const restore = { headline: original.headline, city: original.city, about: original.about, services: original.services, targets: original.targets, links: original.links.map(l => ({ label: l.label, url: l.url })) };
  const out = [];
  try {
    const put = await j('PUT', '/profile', t, TEST_PROFILE);
    if (put.status !== 200) throw new Error('could not set the test profile: ' + put.status);
    const all = (await j('GET', '/leads?size=100&sort=score', t)).json.items;
    for (const [frag, language, channel] of CASES) {
      const lead = all.find(l => new RegExp(frag, 'i').test(l.name));
      if (!lead) { console.log('no lead for', frag); continue; }
      const t0 = Date.now();
      const r = await j('POST', `/leads/${lead.id}/draft`, t, { language, channel });
      out.push({ lead: lead.name, language, channel, secs: Math.round((Date.now() - t0) / 100) / 10, status: r.status, subject: r.json && r.json.subject, body: r.json && r.json.emailBody });
      console.log(`\n=== ${lead.name} | ${language} | ${channel} | ${out[out.length - 1].secs}s | HTTP ${r.status}`);
      if (r.json && r.json.subject) console.log('Subject:', r.json.subject);
      console.log(r.json && r.json.emailBody);
    }
  } finally {
    await j('PUT', '/profile', t, restore);
  }
  fs.writeFileSync(path.join(__dirname, '..', `draft-compare-${label}.json`), JSON.stringify(out, null, 2));
})().catch(e => { console.error(e.message); process.exit(1); });
