// Lead quality benchmark: five fixed real searches through the backend, with the numbers that decide quality
// and the top five leads of each search, so a person can judge them.
// Usage: BENCH_EMAIL=... BENCH_PASSWORD=... node tools/benchmark.js   (optional: BENCH_API=http://localhost:8081/api)
// Each run uses five searches of that account's daily limit and real API credits (about 16 Serper credits per search).
// reachable = phone, email or social page; nameOnType = the name fits the business type (rough check).
const API = process.env.BENCH_API || 'http://localhost:8081/api';
if (!process.env.BENCH_EMAIL || !process.env.BENCH_PASSWORD) { console.error('Set BENCH_EMAIL and BENCH_PASSWORD.'); process.exit(1); }
const CASES = [
  { niche: 'gyms', bbox: '10.0596,36.7416,10.3144,36.8648', type: /gym|fit|sport|club|muscu|body|cross|box|yoga/i },
  { niche: 'restaurants', cities: ['Tunis'], type: /./ },
  { niche: 'dental clinics', cities: ['Sousse'], type: /dent|dr\.?|docteur|cabinet|clini|orthodon/i },
  { niche: 'hair salons', cities: ['Ariana'], type: /./ },
  { niche: 'hotels', cities: ['Hammamet'], type: /./ },
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const tok = (await (await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.BENCH_EMAIL, password: process.env.BENCH_PASSWORD }) })).json()).token;
  const h = { authorization: 'Bearer ' + tok, 'content-type': 'application/json' };
  const rows = [];
  for (const c of CASES) {
    const t0 = Date.now();
    const req = { niche: c.niche, ...(c.bbox ? { bbox: c.bbox } : { cities: c.cities, city: c.cities.join(', ') }) };
    const job = await (await fetch(API + '/searches', { method: 'POST', headers: h, body: JSON.stringify(req) })).json();
    let d = { job };
    while (d.job.status === 'PENDING' && Date.now() - t0 < 240000) { await sleep(3000); d = await (await fetch(API + '/searches/' + job.id, { headers: h })).json(); }
    const L = d.leads || [];
    const reach = L.filter(l => l.phone || (l.emails || []).length || (l.social || []).length).length;
    const site = L.filter(l => l.website).length;
    const strong = L.filter(l => (l.score || 0) >= 7).length;
    const onType = L.filter(l => c.type.test(l.name || '')).length;
    rows.push({ search: c.niche + ' / ' + (c.bbox ? 'drawn area' : c.cities.join(',')), status: d.job.status, secs: Math.round((Date.now() - t0) / 1000),
      leads: L.length, reachable: pct(reach, L.length), website: pct(site, L.length), strongFit: strong, nameOnType: pct(onType, L.length) });
    console.log(JSON.stringify(rows[rows.length - 1]));
    const top = [...L].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);
    for (const l of top) console.log('   ', l.score, (l.name || '').slice(0, 40), '|', l.website ? 'site' : 'no site', '|', (l.reason || '').split(' [[fr:')[0].slice(0, 260));
    const dist = {}; for (const l of L) dist[l.score] = (dist[l.score] || 0) + 1; console.log('    scores:', JSON.stringify(dist));
  }
  console.table(rows);
})();
function pct(a, b) { return b ? Math.round(100 * a / b) + '%' : '-'; }
