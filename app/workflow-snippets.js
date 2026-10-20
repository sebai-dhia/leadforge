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
  const social = [...new Set(html.match(/https?:\/\/(?:www\.|m\.)?(?:facebook|instagram)\.com\/[^\s"'<>)\\]+/gi) || [])]
    .filter(u => !/\.com\/(tr|sharer|share|plugins|dialog|login|policies)([?\/]|$)/i.test(u));
  const tel = (html.match(/href\s*=\s*["']tel:([^"']+)["']/gi) || [])
    .map(x => decodeURIComponent(x.replace(/^[^:]*tel:/i, '').replace(/["']$/, '')).trim())
    .filter(p => p.replace(/\D/g, '').length >= 8);
  const hasBooking = /calendly|doctolib|booking|book now|book an? appointment|reserv|rendez-vous|prendre rdv|appointment|حجز|موعد/i.test(html);
  return { emails, social: social.slice(0, 6), phones: [...new Set(tel)], hasBooking, length: html.length };
}
`.trim();

// Passive look at a home page that was fetched anyway: nothing is probed, only what the page itself shows.
const AUDIT = String.raw`
function audit(html) {
  html = typeof html === 'string' ? html : '';
  if (!html) return null;
  const year = new Date().getFullYear();
  const years = (html.match(/(?:©|&copy;|copyright)[^<]{0,40}?(20\d\d|19\d\d)/gi) || []).map(x => +x.match(/(20\d\d|19\d\d)/)[1]);
  const lastYear = years.length ? Math.max(...years) : null;
  const gen = (html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i) || [])[1] || '';
  const wp = gen.match(/wordpress\s+(\d+)/i);
  const jq = html.match(/jquery[-.\/](\d)\.\d/i);
  return {
    noViewport: !/<meta[^>]+name=["']viewport["']/i.test(html),
    legacyMarkup: /<(font|marquee|center|frameset)\b/i.test(html) || /\.swf\b|shockwave-flash/i.test(html) || (html.match(/<table\b/gi) || []).length >= 4,
    stale: lastYear !== null && lastYear <= year - 4,
    thin: html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ').length < 400 || /under construction|coming soon|en construction|site en cours/i.test(html),
    noPreview: !/property=["']og:image["']/i.test(html),
    fewImages: (html.match(/<img\b/gi) || []).length < 4,
    noVideo: !/<video\b|youtube\.com\/embed|youtube-nocookie|player\.vimeo|<iframe[^>]+(youtube|vimeo)/i.test(html),
    noMeta: !/<meta[^>]+name=["']description["']/i.test(html),
    noH1: !/<h1\b/i.test(html),
    noForm: !/<form\b/i.test(html),
    noChat: !/wa\.me|api\.whatsapp|whatsapp\.com\/send|m\.me\/|messenger\.com|tawk\.to|crisp\.chat|intercom|livechat|tidio/i.test(html),
    noAnalytics: !/googletagmanager|google-analytics|gtag\(|fbq\(|fbevents|analytics\.js|hotjar|matomo|plausible/i.test(html),
    noBlog: !/href=["'][^"']*(blog|news|actualit|articles?|journal)/i.test(html),
    noFavicon: !/<link[^>]+rel=["'][^"']*icon/i.test(html),
    noAppLink: !/play\.google\.com\/store|apps\.apple\.com|itunes\.apple\.com/i.test(html),
    noMultilingual: !/hreflang=/i.test(html) && new Set((html.match(/\b(english|français|francais|deutsch|italiano|español|espanol)\b|العربية/gi) || []).map(x => x.toLowerCase())).size < 2,
    outdatedSoftware: Boolean((wp && +wp[1] < 5) || (jq && +jq[1] < 2) || /joomla!?\s*1\./i.test(gen)),
  };
}
`.trim();

// Shared by Pick Candidates and Collect. Accents are removed, generic words are ignored, and a
// result only counts when most of the distinctive words of the business name appear in it.
const NAME_MATCH = String.raw`
const STOP = new Set(['hotel','hotels','cabinet','dr','dre','docteur','doctor','clinique','clinic','restaurant','cafe','salon','coiffure',
  'pharmacie','pharmacy','the','and','des','les','chez','tunis','tunisie','tunisia','dentaire','dentiste','avocat','maitre','spa','gym','fitness',
  'salle','sport','sports','musculation','club','centre','center','studio','coiffeur','boulangerie','patisserie','fast','food']);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = s => norm(s).split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 3 && !STOP.has(t));
const ratio = (needle, hay) => {
  const t = tokens(needle);
  if (!t.length) return 0;
  const h = norm(hay);
  return t.filter(x => h.includes(x)).length / t.length;
};
// What a page of this kind of business talks about. A page that shares the name but none of these is
// probably a different business (a fashion brand called "NafNaf" is not a hair salon).
const NICHES = [
  [/dent/i, 'dentist|dentaire|dentiste|dental|orthodon|\u0623\u0633\u0646\u0627\u0646'],
  [/clinic|doctor|medical|physician|clinique|medecin/i, 'clinique|clinic|medecin|docteur|doctor|patient|consultation|sante|health|\u0637\u0628\u064a\u0628|\u0639\u064a\u0627\u062f\u0629'],
  [/pharmac/i, 'pharmacie|pharmacy|medicament|ordonnance|\u0635\u064a\u062f\u0644'],
  [/restaurant/i, 'restaurant|menu|cuisine|plats?\\b|chef|\u0645\u0637\u0639\u0645'],
  [/caf[e\u00e9]|coffee/i, 'cafe|coffee|boisson|\u0645\u0642\u0647\u0649'],
  [/hotel|guest ?house|riad/i, 'hotel|chambre|rooms?\\b|suite|sejour|resort|guest|\u0641\u0646\u062f\u0642'],
  [/gym|fitness/i, 'gym|fitness|musculation|coach|abonnement|\u0646\u0627\u062f\u064a'],
  [/hair|salon|beauty|barber|spa\b/i, 'coiffure|coiffeu|hair|barber|beaute|beauty|esthetique|manucure|\u062d\u0644\u0627\u0642|\u062a\u062c\u0645\u064a\u0644'],
  [/lawyer|law firm|attorney|avocat/i, 'avocat|lawyer|law firm|juridique|\u0645\u062d\u0627\u0645'],
  [/car repair|garage|mechanic/i, 'garage|mecanique|automobile|voiture|vidange|reparation'],
  [/supermarket|grocery/i, 'supermarche|supermarket|courses|hypermarche|rayon'],
  [/bakery|pastry|patisserie/i, 'boulangerie|patisserie|bakery|gateau|viennoiserie'],
  [/school|academy|training/i, 'ecole|school|formation|eleves|enseignement|\u0645\u062f\u0631\u0633\u0629']
];
const nicheRe = niche => { const hit = NICHES.find(([re]) => re.test(niche || '')); return hit ? new RegExp(hit[1], 'i') : null; };
const plainText = html => String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
`.trim();

// Hosts that list businesses but are not their own website.
const DIRECTORY_HOSTS = String.raw`
const DIRECTORY = /(^|\.)(facebook|instagram|linkedin|twitter|tiktok|youtube|pinterest|tripadvisor|booking|yelp|pagesjaunes|foursquare|google|wikipedia|expedia|agoda|kayak|trivago|hotels|airbnb|mapcarta|zomato|opentable|thefork|yellowpages|waze|bing|yahoo|duckduckgo|med|pharmaboardroom|kompass|europages|cylex|hotfrog|opendi|jumia|tayara|annuaire|doctolib|doctoranytime|tabibi|drest|tripadvisor|restaurantguru|cybo|local|infobel|societe|pagesjaunes)\./i;
`.trim();

module.exports = { SAFE_URL, CONTACT_LINK, SCRAPE, AUDIT, NAME_MATCH, DIRECTORY_HOSTS };
