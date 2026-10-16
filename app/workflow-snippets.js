// JavaScript shared by the n8n Code nodes of both workflows. n8n Code nodes cannot import modules and
// have no URL global, so addresses are parsed by hand and these snippets are embedded as text by
// build-workflow.js and build-enrich-workflow.js.

// A website address that comes from public data (OpenStreetMap) or from an AI answer is untrusted.
// Never fetch anything that points into a private network, or that is not plain http(s) on a normal port.
// Only real domain names are accepted: a host whose last label is not letters ("127.1", "0x7f.0.0.1",
// "2130706433") can be read by some HTTP clients as an IP address, so it is refused.
// This does not stop a public hostname that resolves to a private address: run n8n without access to
// internal services (see README).
const SAFE_URL = String.raw`
function parseUrl(u) {
  if (!u || typeof u !== 'string') return null;
  let s = u.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'http://' + s;
  const m = s.match(/^(https?):\/\/(?:([^\/?#@]*)@)?(\[[^\]]*\]|[^\/?#:]+)(?::(\d*))?([\/?#][^#]*)?(?:#.*)?$/i);
  if (!m) return null;
  return { protocol: m[1].toLowerCase(), userinfo: m[2] || '', hostname: m[3].toLowerCase(), port: m[4] || '', rest: m[5] || '/' };
}
function safeUrl(u) {
  const p = parseUrl(u);
  if (!p || p.userinfo) return null;
  if (p.port && p.port !== '80' && p.port !== '443') return null;
  const h = p.hostname;
  if (h.startsWith('[') || h.includes(':')) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.([a-z]{2,24}|xn--[a-z0-9-]{2,59})$/.test(h)) return null;
  if (h === 'localhost' || /\.(local|internal|localhost|lan|home|corp|intranet|test|invalid|example)$/.test(h)) return null;
  if (/(^|\.)(nip\.io|sslip\.io|xip\.io|localtest\.me|lvh\.me|vcap\.me)$/.test(h)) return null;
  const rest = p.rest.startsWith('/') ? p.rest : '/' + p.rest;
  return p.protocol + '://' + h + (p.port ? ':' + p.port : '') + rest;
}
`.trim();

// Picks the page most likely to list contact details, on the same site as the home page.
const CONTACT_LINK = String.raw`
function resolveUrl(href, base) {
  const origin = base.protocol + '://' + base.hostname + (base.port ? ':' + base.port : '');
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('//')) return base.protocol + ':' + href;
  if (href.startsWith('/')) return origin + href;
  const dir = base.rest.split(/[?#]/)[0].replace(/[^\/]*$/, '');
  const parts = (dir + href).split('/');
  const out = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.') out.push(part);
  }
  return origin + (out.join('/').startsWith('/') ? '' : '/') + out.join('/');
}
function contactLink(html, baseUrl) {
  if (!baseUrl || typeof html !== 'string' || !html) return null;
  const want = /contact|kontakt|nous[- ]contacter|contactez|a[- ]propos|about|à propos|اتصل|تواصل/i;
  const base = parseUrl(baseUrl);
  if (!base) return null;
  const host = h => h.replace(/^www\./, '');
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (/^(mailto|tel|javascript|data):/i.test(href)) continue;
    if (!want.test(href) && !want.test(m[2].replace(/<[^>]+>/g, ' '))) continue;
    const full = resolveUrl(href, base);
    const target = parseUrl(full);
    if (!target || host(target.hostname) !== host(base.hostname)) continue;
    const safe = safeUrl(full);
    if (safe && safe.replace(/\/$/, '') !== safeUrl(baseUrl).replace(/\/$/, '')) return safe;
  }
  return null;
}
`.trim();

// Contact details found on a page. The backend ranks and cleans emails and social links again,
// so this only has to find candidates.
const SCRAPE = String.raw`
function scrape(html) {
  html = typeof html === 'string' ? html : '';
  const mailto = (html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi) || []).map(x => x.slice(7));
  const plain = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const emails = [...new Set([...mailto, ...plain].map(e => e.toLowerCase()))]
    .filter(e => !/\.(png|jpe?g|gif|svg|webp|ico|css|js)$/.test(e));
  const social = [...new Set(html.match(/https?:\/\/(?:www\.|m\.)?(?:facebook|instagram)\.com\/[^\s"'<>)\\]+/gi) || [])];
  const tel = (html.match(/href\s*=\s*["']tel:([^"']+)["']/gi) || [])
    .map(x => decodeURIComponent(x.replace(/^[^:]*tel:/i, '').replace(/["']$/, '')).trim())
    .filter(p => p.replace(/\D/g, '').length >= 8);
  const hasBooking = /calendly|doctolib|booking|book now|book an? appointment|reserv|rendez-vous|prendre rdv|appointment|حجز|موعد/i.test(html);
  return { emails, social: social.slice(0, 6), phones: [...new Set(tel)], hasBooking, length: html.length };
}
`.trim();

module.exports = { SAFE_URL, CONTACT_LINK, SCRAPE };
