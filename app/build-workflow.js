// Generates n8n/lead-finder.workflow.json for the Spring Boot backend (run: node build-workflow.js)
// Flow: Webhook (responds at once) -> geocode city -> Geoapify places -> fetch home page and contact page
//       -> rule-based score -> POST results to the backend callback.
const fs = require('fs');
const { withDeployIds } = require('./n8n-deploy-ids');
const { SAFE_URL, CONTACT_LINK, SCRAPE, AUDIT, NAME_MATCH, DIRECTORY_HOSTS } = require('./workflow-snippets');
const prompts = require('./prompts-lib');

const expandAreasCode = String.raw`
const body = $('Webhook').first().json.body || {};
if (body.bbox) return [{ json: { bbox: String(body.bbox) } }];
const areas = String(body.city || '').split('|').map(x => x.trim()).filter(Boolean).slice(0, 3);
return areas.length ? areas.map(text => ({ json: { text } })) : [{ json: { text: '' } }];
`.trim();

const queryCode = String.raw`
const body = $('Webhook').first().json.body || {};
const map = [
  [/dent/i, 'healthcare.dentist'],
  [/clinic|doctor|medical|physician|clinique|medecin/i, 'healthcare.clinic_or_praxis'],
  [/pharmac/i, 'healthcare.pharmacy'],
  [/restaurant/i, 'catering.restaurant'],
  [/caf[eé]|coffee/i, 'catering.cafe'],
  [/hotel|guest ?house|riad/i, 'accommodation.hotel'],
  [/gym|fitness/i, 'sport.fitness'],
  [/hair|salon|beauty|barber|spa\b/i, 'service.beauty'],
  [/lawyer|law firm|attorney|avocat/i, 'office.lawyer'],
  [/car repair|garage|mechanic/i, 'service.vehicle.repair.car'],
  [/supermarket|grocery/i, 'commercial.supermarket'],
  [/bakery|pastry|patisserie/i, 'commercial.food_and_drink.bakery'],
  [/school|academy|training/i, 'education.school']
];
const hit = map.find(([re]) => re.test(body.niche || ''));
const categories = hit ? hit[1] : 'commercial,service,office,catering';
const name = hit ? null : body.niche;

// One item per area: a drawn rectangle comes straight from Expand Areas, a city comes back from the geocoder.
// Each item carries the Google Maps query (Serper) and the Geoapify filter used when Maps returns nothing.
const areas = $('Expand Areas').all();
const out = [];
$input.all().forEach((item, i) => {
  const j = item.json || {};
  if (j.bbox) {
    const [w, s, e, n] = String(j.bbox).split(',').map(Number);
    const span = Math.max(e - w, n - s, 0.005);
    const zoom = Math.max(10, Math.min(17, Math.round(Math.log2(1400 / span))));
    out.push({ json: { filter: 'rect:' + j.bbox, categories, name, geo: true,
      maps: { q: body.niche, ll: '@' + ((s + n) / 2).toFixed(5) + ',' + ((w + e) / 2).toFixed(5) + ',' + zoom + 'z' } } });
  } else {
    const g = (j.results || [])[0];
    const text = ((areas[i] && areas[i].json.text) || '').trim();
    if (!g) return;
    // A city keeps the map point, which brings the small local businesses. When the geocoder only found a whole
    // region (its point can be far from the town), Google finds the town by name and the country keeps it local.
    const town = /^(city|suburb|district|postcode|street|amenity|building)$/.test(String(g.result_type || ''));
    out.push({ json: { filter: 'circle:' + g.lon + ',' + g.lat + ',10000', categories, name, geo: true,
      maps: { q: (body.niche + ' ' + text).trim(), ...(g.country_code ? { gl: String(g.country_code).toLowerCase() } : {}),
        ...(town ? { ll: '@' + Number(g.lat).toFixed(5) + ',' + Number(g.lon).toFixed(5) + ',13z' } : {}) } } });
  }
});
// A single area gets a second Maps call (no second Geoapify call): the French name of the trade, since local
// businesses are mostly listed in French; when no French name is known, the next page of the same query.
const FR = [
  [/dent/i, 'dentiste'], [/clinic|doctor|medical|physician/i, 'clinique médecin'], [/pharmac/i, 'pharmacie'],
[/caf[eé]|coffee/i, 'café salon de thé'], [/hotel|guest ?house/i, 'hôtel'],
  [/gym|fitness/i, 'salle de sport'], [/hair|barber/i, 'salon de coiffure'], [/beauty|spa\b/i, 'institut de beauté'],
  [/lawyer|law firm|attorney/i, 'avocat'], [/car repair|garage|mechanic/i, 'garage mécanique auto'],
  [/supermarket|grocery/i, 'supermarché'], [/bakery|bakeries|pastry/i, 'boulangerie pâtisserie'], [/school|academy|training/i, 'école centre de formation'],
];
if (out.length === 1) {
  const fr = (FR.find(([re]) => re.test(body.niche || '')) || [])[1];
  const area = ((areas[0] && areas[0].json.text) || '').trim();
  const maps = fr && fr !== String(body.niche).toLowerCase()
    ? { ...out[0].json.maps, q: (fr + ' ' + area).trim() }
    : { ...out[0].json.maps, page: 2 };
  out.push({ json: { ...out[0].json, geo: false, maps } });
}
return out.length ? out : [{ json: { _empty: true } }];
`.trim();

const prepareCode = SAFE_URL + '\n' + NAME_MATCH + '\n' + String.raw`
// Web lookups cost search credits: only the first few leads that miss a website or a way to reach them,
// and never a business looked up in the last 30 days (kept in the workflow's static data).
const cache = $getWorkflowStaticData('global');
cache.lookups = cache.lookups || {};
const DAY = 86400000;
let lookupsLeft = Math.max(0, Math.min(15, Number(($('Webhook').first().json.body || {}).lookupLimit) || 15));
const areaOf = addr => String(addr || '').split(',').map(x => x.trim()).filter(x => x && !/^\d+$/.test(x)).slice(-2, -1).map(x => x.replace(/\d+/g, '').trim())[0] || '';
function markLookup(item) {
  const l = item.json;
  // a name made only of trade words ("salle de sport") would match some other business: never search it
  if (!tokens(l.name).length) return item;
  const hit = l.placeId && cache.lookups[l.placeId];
  if (hit && Date.now() - hit.t < 30 * DAY) {
    return { json: { ...l, cached: true, foundWebsite: !l.website && hit.website ? hit.website : null,
      website: l.website || hit.website || null, fetchUrl: l.fetchUrl || safeUrl(hit.website),
      foundSocial: hit.social || [], foundPhone: hit.phone || null, lookedUp: true } };
  }
  const needs = !l.website || (!l.phone && !l.osmEmail);
  if (!needs || lookupsLeft <= 0) return item;
  lookupsLeft--;
  return { json: { ...l, lookup: true, lookupQuery: [l.name, areaOf(l.address) || l.city].filter(Boolean).join(' ').slice(0, 200) } };
}

const body = $('Webhook').first().json.body || {};
const fix = u => (u && !/^https?:\/\//i.test(u) ? 'http://' + u : u) || null;
// A Facebook, Instagram or Linktree page listed as the website is a social page: the business has no website.
const lead = (o) => {
  const social = /(facebook|instagram|linktr)\./i.test(o.website || '');
  return { ...o, website: social ? null : o.website, socialPages: social ? [o.website] : [],
    fetchUrl: social ? null : safeUrl(o.website),
    niche: body.niche, city: body.city, service: body.service, sender: body.sender };
};
const generic = n => /^(restaurants?|fast ?food|caf[eé]s?|hotels?|pharmacy|pharmacies|shop|store|market|bakery|salon|gym|clinic)$/i.test(String(n || '').trim());

// Google Maps places (Serper). The Google category must fit the business type searched for.
const TYPES = [
  [/dent/i, /dent|orthodon/i],
  [/clinic|doctor|medical|physician|clinique|medecin/i, /clini|m[eé]decin|doctor|docteur|cabinet|sant[eé]|health|medical|polyclini/i],
  [/pharmac/i, /pharmac/i],
  [/restaurant/i, /restaurant|pizz|grill|fast|snack|brasserie|food|sandwich|burger|cuisine|traiteur/i],
  [/caf[eé]|coffee/i, /caf[eé]|coffee|salon de th[eé]|tea/i],
  [/hotel|guest ?house|riad/i, /h[oô]tel|guest|maison d'h[oô]tes|riad|resort|auberge|h[eé]bergement/i],
  [/gym|fitness/i, /gym|fitness|musculation|sport|crossfit|yoga|pilates|boxing|boxe|arts martiaux/i],
  [/hair|salon|beauty|barber|spa\b/i, /coiff|hair|beaut|barb|spa\b|esth[eé]ti|ongle|nail|institut/i],
  [/lawyer|law firm|attorney|avocat/i, /avocat|lawyer|law|juridique|notaire|attorney/i],
  [/car repair|garage|mechanic/i, /garage|m[eé]cani|auto|car repair|carross|pneu/i],
  [/supermarket|grocery/i, /supermarch|march[eé]|grocery|[eé]picerie|hypermarch/i],
  [/bakery|pastry|patisserie/i, /boulanger|p[aâ]tisser|bakery|pastry/i],
  [/school|academy|training/i, /[eé]cole|school|academ|formation|training|centre de formation|institut/i],
];
const want = (TYPES.find(([re]) => re.test(body.niche || '')) || [])[1] || null;
const box = body.bbox ? String(body.bbox).split(',').map(Number) : null;
const inBox = p => !box || (p.longitude >= box[0] && p.latitude >= box[1] && p.longitude <= box[2] && p.latitude <= box[3]);
const seen = new Set(), mapsLeads = [];
for (const item of $('Maps Search').all()) {
  for (const p of ((item.json && item.json.places) || [])) {
    if (!p.title || generic(p.title) || !inBox(p)) continue;
    const kinds = [p.type, ...(p.types || [])].filter(Boolean).join(' ');
    if (want && !want.test(kinds)) continue;
    const key = 'gm:' + (p.placeId || p.cid || p.title + '|' + p.address);
    if (seen.has(key)) continue;
    seen.add(key);
    mapsLeads.push(lead({ placeId: key, name: p.title, address: p.address || null, phone: p.phoneNumber || null,
      osmEmail: null, rating: p.rating || null, reviews: p.ratingCount || 0, website: fix(p.website || null) }));
  }
}
if (mapsLeads.length) return mapsLeads.map(l => markLookup({ json: l }));

// Fallback: OpenStreetMap places from Geoapify
const feats = [];
for (const item of $input.all()) {
  for (const f of ((item.json && item.json.features) || [])) {
    if (!f.properties || !f.properties.name) continue;
    // a name that is only a category word is not a business a freelancer can write to
    if (generic(f.properties.name)) continue;
    const key = f.properties.place_id || (f.properties.name + '|' + f.properties.formatted);
    if (seen.has(key)) continue;
    seen.add(key);
    feats.push(f);
  }
}
if (!feats.length) return [{ json: { _empty: true } }];
return feats.map(f => {
  const p = f.properties, c = p.contact || {}, raw = (p.datasource && p.datasource.raw) || {};
  return { json: lead({
    placeId: p.place_id || null,
    name: p.name,
    address: p.address_line2 || p.formatted || null,
    phone: p.phone || c.phone || raw.phone || raw['contact:phone'] || null,
    osmEmail: c.email || p.email || raw.email || raw['contact:email'] || null,
    rating: null,
    reviews: 0,
    website: fix(p.website || c.website || raw.website || raw['contact:website'] || null),
  }) };
}).map(markLookup);
`.trim();

const matchLookupCode = SAFE_URL + '\n' + NAME_MATCH + '\n' + DIRECTORY_HOSTS + '\n' + String.raw`
// Keeps only search results that clearly belong to the business: name tokens, trade words or its phone.
const cache = $getWorkflowStaticData('global');
cache.lookups = cache.lookups || {};
const leads = $('Prepare').all();
const results = $input.all();
const out = leads.map((item, i) => {
  const l = { ...item.json };
  if (l._empty || !l.lookup) return { json: l };
  const r = (results[i] && results[i].json) || {};
  const organic = Array.isArray(r.organic) ? r.organic : [];
  const kind = nicheRe(l.niche);
  const phoneDigits = String(l.phone || '').replace(/\D/g, '').slice(-8);
  let website = null;
  const social = [];
  for (const it of organic) {
    const p = parseUrl(it.link);
    if (!p) continue;
    const host = p.hostname.replace(/^www\./, '');
    const pathText = decodeURIComponent((p.rest || '').split(/[?#]/)[0].replace(/[-_.\/]+/g, ' '));
    const hay = (it.title || '') + ' ' + (it.snippet || '') + ' ' + pathText;
    if (/(^|\.)(facebook|instagram)\.com$/i.test(host)) {
      const sHay = (it.title || '') + ' ' + (it.snippet || '');
      const sameKind = (kind && kind.test(norm(sHay + ' ' + host + ' ' + pathText))) || (phoneDigits.length >= 6 && sHay.replace(/\D/g, '').includes(phoneDigits));
      if (social.length < 2 && sameKind && ratio(l.name, (it.title || '') + ' ' + pathText) >= 0.6) social.push(it.link);
      continue;
    }
    if (DIRECTORY.test(host + '.')) continue;
    if (!website && !l.website && ratio(l.name, hay + ' ' + host) >= 0.6) website = safeUrl(it.link);
  }
  const kg = r.knowledgeGraph || null;
  if (!website && !l.website && kg && kg.website && ratio(l.name, kg.title || '') >= 0.6) website = safeUrl(kg.website);
  const kgPhone = kg && kg.phoneNumber && ratio(l.name, kg.title || '') >= 0.6 ? String(kg.phoneNumber) : null;
  const searched = organic.length > 0 || !!kg;
  if (searched && l.placeId) {
    cache.lookups[l.placeId] = { t: Date.now(), website, social, phone: kgPhone };
    const keys = Object.keys(cache.lookups);
    if (keys.length > 5000) for (const k of keys.slice(0, keys.length - 5000)) delete cache.lookups[k];
  }
  return { json: { ...l, lookup: false, lookedUp: searched, foundWebsite: website, website: l.website || website,
    fetchUrl: l.fetchUrl || website, foundSocial: social, foundPhone: kgPhone } };
});
return out;
`.trim();

const findContactCode = SAFE_URL + '\n' + CONTACT_LINK + '\n' + String.raw`
const leads = $('Match Lookup').all();
return $input.all().map((item, i) => {
  const lead = leads[i].json;
  const base = lead._empty ? null : lead.fetchUrl;
  const html = item.json && typeof item.json.data === 'string' ? item.json.data : '';
  // the home page already gave a phone and an email: the contact page cannot add much, skip the extra request
  const complete = lead.phone && /mailto:|[w.+-]+@[w-]+.[a-z]{2,}/i.test(html);
  return { json: { contactUrl: base && !complete ? contactLink(html, base) : null } };
});
`.trim();

const extractCode = SCRAPE + '\n' + AUDIT + '\n' + NAME_MATCH + '\n' + String.raw`
const leads = $('Match Lookup').all();
const home = $('Fetch Website').all();
return $input.all().map((contact, i) => {
  const lead = { ...leads[i].json };
  if (lead._empty) return { json: { _empty: true } };
  let homeHtml = home[i] && home[i].json && typeof home[i].json.data === 'string' ? home[i].json.data : '';
  let contactHtml = contact.json && typeof contact.json.data === 'string' ? contact.json.data : '';
  if (lead.foundWebsite) {
    // found by web search: trust it only if the page names the business (or shows its phone) and talks about its trade
    const text = plainText(homeHtml), kind = nicheRe(lead.niche);
    const phoneKey = String(lead.phone || '').replace(/\D/g, '').slice(-8);
    const ok = homeHtml && ((phoneKey.length >= 6 && homeHtml.replace(/\D/g, '').includes(phoneKey)) || (ratio(lead.name, text) >= 0.6 && !!kind && kind.test(norm(text))));
    if (!ok) { lead.website = null; homeHtml = ''; contactHtml = ''; }
  }
  const a = scrape(homeHtml);
  const b = scrape(contactHtml);
  const emails = [...new Set([lead.osmEmail ? lead.osmEmail.toLowerCase() : null, ...a.emails, ...b.emails].filter(Boolean))];
  const social = [...new Set([...(lead.socialPages || []), ...(lead.foundSocial || []), ...a.social, ...b.social])].slice(0, 6);
  const phone = lead.phone || a.phones[0] || b.phones[0] || lead.foundPhone || null;
  const out = { ...lead, phone, emails: emails.slice(0, 8), social, hasBooking: a.hasBooking || b.hasBooking, siteChecked: a.length > 0, audit: audit(homeHtml), siteText: plainText(homeHtml).replace(/\s+/g, ' ').trim().slice(0, 600) };
  for (const k of ['foundWebsite', 'foundSocial', 'foundPhone', 'lookup', 'lookupQuery', 'cached', 'socialPages']) delete out[k];
  delete out.osmEmail; delete out.fetchUrl;
  return { json: out };
});
`.trim();

const scoreCode = NAME_MATCH + '\n' + String.raw`
// Fit score (1-10) for what THIS freelancer sells. The focus comes from the offer text in the request.
// Points: opportunity (0-5) + demand from reviews (0-1.5) + reachability (0-1). Only the best few may score 8+;
// the AI check then confirms or lowers those.
const body = $('Webhook').first().json.body || {};
const offer = String(body.service || '').toLowerCase();
// What to look for depends on what is sold. An offer can be several things at once ("Photography, Video and motion, SEO"):
// each kind looks for its own weaknesses and the best opening found counts. Nothing recognised means a website or booking gap.
// Each pattern is a kind of work; the first word list that matches the offer text adds that kind. Unrecognised text gets a neutral check.
const KINDS = [
  ['dev', /web|site|wordpress|shopify|woocommerce|e-?commerce|develop|full.?stack|laravel|react|angular|php/],
  ['app', /\bapps?\b|mobile|android|ios|flutter/],
  ['automation', /automat|zapier|n8n|\bbots?\b|workflow|integration|\bcrm\b/],
  ['design', /\bux\b|\bui\b|design|graphic|flyer|poster|packaging/],
  ['brand', /logo|brand|identit/],
  ['visual', /photo|video|motion|film|illustrat|drone/],
  ['voice', /voice|narrat|dubbing|podcast|audio/],
  ['seo', /\bseo\b|referencement|référencement|search engine/],
  ['copy', /copywrit|writer|writing|content|blog|article|storytelling|rédact|redact/],
  ['creative', /strateg|social media|instagram|tiktok|community/],
  ['ads', /advert|\bads\b|marketing|campaign|sponsor/],
  ['translation', /translat|traduc|interpret|locali[sz]/],
];
const FOCI = KINDS.filter(([, re]) => re.test(offer)).map(([name]) => name);
if (!FOCI.length) FOCI.push('presence');
const wantsVideo = /video|motion|film/.test(offer);
const items = $input.all();
// a name shared by three or more results is a chain: hard to sell to, decided far away
const nameKey = n => tokens(n)[0] || '';
const counts = {};
for (const it of items) { const k = nameKey(it.json && it.json.name); if (k) counts[k] = (counts[k] || 0) + 1; }

const scored = items.map(item => {
  const l = item.json;
  if (l._empty) return item;
  const niche = (l.niche || '').toLowerCase();
  const appointment = /dent|clinic|clinique|doctor|medecin|physio|kine|salon|hair|beauty|barber|spa\b|lawyer|avocat|law|gym|fitness|hotel|guest|garage|car repair|mechanic|pharmac/.test(niche);
  const food = /restaurant|caf[eé]|bakery|pastry|patisserie/.test(niche);
  const hasPhone = Boolean(l.phone);
  const hasEmail = Boolean(l.emails && l.emails.length);
  const hasSocial = Boolean(l.social && l.social.length);
  const isReachable = hasPhone || hasEmail || hasSocial;
  const au = l.audit || null;
  const noSite = !l.website;
  const brokenSite = Boolean(l.website) && !l.siteChecked;

  const gapsFor = focus => {
  const flags = [];
  let opp = 0;

  if (focus === 'design') {
    if (noSite) { opp = 4; flags.push('no website to design from'); }
    else if (brokenSite) { opp = 0.5; flags.push('website could not be checked'); }
    else if (au) {
      if (au.noViewport) { opp += 2.5; flags.push('site is not mobile-friendly'); }
      if (au.legacyMarkup) { opp += 2; flags.push('dated page layout'); }
      if (au.stale) { opp += 1.5; flags.push('site looks outdated'); }
      if (au.thin) { opp += 1.5; flags.push('very thin or unfinished site'); }
      if (!opp) flags.push('site looks modern');
    }
  } else if (focus === 'visual') {
    if (!hasSocial) { opp += 2; flags.push('no social page found'); }
    if (noSite) { opp += 1; flags.push('no website'); }
    else if (au) {
      if (au.fewImages) { opp += 2; flags.push('few photos on the site'); }
      if (wantsVideo && au.noVideo) { opp += 1.5; flags.push('no video on the site'); }
      if (au.noPreview) { opp += 0.5; flags.push('no social preview image on the site'); }
    }
    if (hasSocial && !opp) flags.push('active online presence');
  } else if (focus === 'seo') {
    if (noSite) { opp = 4; flags.push('no website to rank'); }
    else if (brokenSite) { opp = 0.5; flags.push('website could not be checked'); }
    else if (au) {
      if (au.noMeta) { opp += 2; flags.push('no page description for search engines'); }
      if (au.noH1) { opp += 1; flags.push('no main heading on the home page'); }
      if (au.noViewport) { opp += 1.5; flags.push('site is not mobile-friendly'); }
      if (au.thin) { opp += 1.5; flags.push('very thin or unfinished site'); }
      if (au.stale) { opp += 1; flags.push('site looks outdated'); }
      if (!opp) flags.push('site basics are in place');
    }
  } else if (focus === 'app') {
    if (noSite) { opp += 1.5; flags.push('no website'); }
    else if (au && au.noAppLink) { opp += 2.5; flags.push('no mobile app found'); }
    if (!l.hasBooking && (appointment || food)) { opp += 1.5; flags.push('no way to book or order from a phone'); }
  } else if (focus === 'automation') {
    if (noSite) { opp += 2; flags.push('no website to connect'); }
    else if (au) {
      if (!l.hasBooking && (appointment || food)) { opp += 2.5; flags.push('no online booking or ordering'); }
      if (au.noForm) { opp += 1.5; flags.push('no contact form'); }
      if (au.noChat) { opp += 1; flags.push('no WhatsApp or chat button'); }
    }
  } else if (focus === 'brand') {
    if (noSite) { opp += 2.5; flags.push('no website to show a brand'); }
    else if (au) {
      if (au.noFavicon) { opp += 1.5; flags.push('no site icon'); }
      if (au.noPreview) { opp += 1; flags.push('no social preview image on the site'); }
      if (au.legacyMarkup || au.stale) { opp += 2; flags.push('dated look'); }
    }
    if (!hasSocial) { opp += 1; flags.push('no social page found'); }
  } else if (focus === 'voice') {
    if (noSite) { opp += 1; flags.push('no website'); }
    else if (au && au.noVideo) { opp += 3; flags.push('no video or audio on the site'); }
    if (!hasSocial) { opp += 1; flags.push('no social page found'); }
  } else if (focus === 'copy') {
    if (noSite) { opp += 2; flags.push('no website text'); }
    else if (au) {
      if (au.thin) { opp += 2; flags.push('very thin or unfinished site'); }
      if (au.noMeta) { opp += 1.5; flags.push('no page description'); }
      if (au.noH1) { opp += 1; flags.push('no main heading on the home page'); }
      if (au.noBlog) { opp += 1.5; flags.push('no blog or news section'); }
    }
  } else if (focus === 'ads') {
    if (noSite) { opp += 3; flags.push('no website to send ad traffic to'); }
    else if (au && au.noAnalytics) { opp += 3; flags.push('no visit or ad tracking found'); }
    if (!hasSocial) { opp += 1.5; flags.push('no social page found'); }
  } else if (focus === 'translation') {
    if (noSite) { opp += 1; flags.push('no website'); }
    else if (au && au.noMultilingual) { opp += 3; flags.push('site is in one language'); }
  } else if (focus === 'presence') {
    if (noSite) { opp += 2.5; flags.push('no website'); }
    else if (brokenSite) { opp += 0.5; flags.push('website could not be checked'); }
    else if (au) {
      if (au.noViewport) { opp += 1; flags.push('site is not mobile-friendly'); }
      if (au.legacyMarkup || au.stale) { opp += 1; flags.push('dated site'); }
      if (au.thin) { opp += 1; flags.push('very thin or unfinished site'); }
    }
    if (!hasSocial) { opp += 2; flags.push('no social page found'); }
  } else if (focus === 'creative') {
    if (!hasSocial) { opp += 3; flags.push('no social page found'); }
    if (noSite) { opp += 1; flags.push('no website'); }
    else if (au && au.noPreview) { opp += 1; flags.push('no social preview image on the site'); }
    if (au && (au.noViewport || au.legacyMarkup || au.stale)) { opp += 1; flags.push('weak online presence'); }
    if (hasSocial && !opp) flags.push('active online presence');
  } else {
    if (noSite) { opp = 4; flags.push('no website (needs a build)'); }
    else if (brokenSite) { opp = 0.5; flags.push('website could not be checked'); }
    else if (au) {
      if (au.outdatedSoftware) { opp += 1; flags.push('outdated software detected'); }
      if (!l.hasBooking && (appointment || food)) { opp += 2; flags.push('no online booking or ordering'); }
      else if (l.hasBooking) flags.push('website already mentions online booking');
      if (au.noViewport) { opp += 1; flags.push('site is not mobile-friendly'); }
    }
  }
  return { opp: Math.min(opp, 5), flags };
  };
  // the best opening among the kinds of work this freelancer sells
  const found = FOCI.map(gapsFor).sort((x, y) => y.opp - x.opp)[0];
  const flags = found.flags;
  const opp = found.opp;

  const reviews = l.reviews || 0;
  const demand = reviews >= 100 ? 1.5 : reviews >= 30 ? 1 : reviews >= 5 ? 0.5 : 0;
  if (reviews >= 20) flags.push('active on Google Maps');
  const reach = hasPhone && (hasEmail || hasSocial) ? 1 : isReachable ? 0.5 : 0;

  let raw = 2 + opp + demand + reach + ((appointment || food) ? 0.5 : 0);
  if (reviews >= 1500) { raw -= 1.5; flags.push('large, well-known business'); }
  if ((counts[nameKey(l.name)] || 0) >= 3) { raw -= 2; flags.push('part of a chain'); }
  if (/group|groupe|international|global|network|holding|banque|bank|assurance|insurance|corporate/i.test(l.name || '')) { raw -= 2; flags.push('looks like a large organisation'); }
  if (!isReachable) { raw = Math.min(raw, 3); flags.push('unreachable: no phone or email found yet'); }

  const why = appointment ? 'Appointment-based business' : food ? 'Reservation and ordering business' : 'Local business';
  return { json: { ...l, raw, score: Math.max(1, Math.min(10, Math.round(raw))),
    reason: why + ': ' + (flags.length ? flags.join(', ') : 'no clear opportunity seen') + '.' } };
});

// Spread: only the eight best can stay above 6, and they go to the AI check.
const order = scored.map((it, i) => [it.json.raw ?? -1, i]).sort((a, b) => b[0] - a[0]);
order.forEach(([, i], rank) => {
  const j = scored[i].json;
  if (j._empty) return;
  if (rank >= 8) j.score = Math.min(j.score, 6);
  j.aiCheck = rank < 8 && j.score >= 5;
  delete j.raw;
});
return scored;
`.trim();

// The prompt text, the wording of each lead line, the limits and the model settings are data in prompts/fit/.
const FIT = prompts.load('fit');
const AI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/' + FIT.data.config.model + ':generateContent';
const aiPromptCode = prompts.embed(FIT) + '\n' + fs.readFileSync(__dirname + '/workflow-src/fit/prompt.js', 'utf8').trim();

const applyAiCode = String.raw`

// The AI fit weighs more than the rules for the checked leads. Without an answer, the rule score stays.
const leads = $('Score').all().map(i => ({ ...i.json }));
const idx = $('AI Prompt').first().json.idx || [];
let results = [];
try {
  const r = $input.first().json || {};
  const raw = (r.candidates && r.candidates[0].content.parts.map(p => p.text || '').join('')) || '';
  const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  results = Array.isArray(o.results) ? o.results : [];
} catch (e) { results = []; }
const tidy = t => String(t || '').replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);
for (const res of results) {
  const i = idx[(Number(res.k) || 0) - 1];
  const l = i === undefined ? null : leads[i];
  const fit = Math.round(Number(res.fit));
  if (!l || !(fit >= 1 && fit <= 10)) continue;
  l.score = Math.max(1, Math.min(10, Math.round(0.5 * l.score + 0.5 * fit)));
  const en = tidy(res.why_en), fr = tidy(res.why_fr);
  const sig = ['gap', 'pain', 'neglect', 'momentum'].includes(res.signal) ? res.signal : '';
  // a note that reuses a word of the rule checks says the same thing twice: keep only the group
  const words = t => (String(t).toLowerCase().match(/[a-zà-ÿ]{4,}/g) || []);
  const known = new Set(words(l.reason));
  const repeats = words(en).some(w => known.has(w));
  if (en && !repeats) l.reason = l.reason + ' AI: ' + en + (fr ? ' [[fr:' + fr + ']]' : '') + (sig ? ' [[sig:' + sig + ']]' : '');
  else if (sig) l.reason = l.reason + ' [[sig:' + sig + ']]';
}
return leads.map(json => ({ json }));

`.trim();

const formatCode = String.raw`
const jobId = $('Webhook').first().json.body.jobId;
const out = $input.all().map(i => i.json).filter(l => !l._empty).map(l => {
  const r = { ...l, subject: '', emailBody: '' };
  for (const k of ['niche', 'city', 'service', 'sender', 'hasBooking', 'siteChecked', 'fetchUrl', 'audit', 'lookedUp', 'siteText', 'aiCheck']) delete r[k];
  return r;
});
out.sort((a, b) => {
  const aReachable = Boolean(a.phone || (a.emails && a.emails.length) || (a.social && a.social.length));
  const bReachable = Boolean(b.phone || (b.emails && b.emails.length) || (b.social && b.social.length));
  if (aReachable !== bReachable) return bReachable ? 1 : -1;
  return b.score - a.score;
});
// A drawn rectangle has no name: use the town that appears most in the addresses ("..., Tunis 2092, Tunisia").
let areaName = null;
if ($('Webhook').first().json.body.bbox) {
  const towns = {};
  for (const l of out) {
    const parts = String(l.address || '').split(',').map(x => x.replace(/\d+/g, '').trim()).filter(Boolean);
    const town = parts.length >= 2 ? parts[parts.length - 2] : null;
    if (town && town.length <= 40) towns[town] = (towns[town] || 0) + 1;
  }
  const best = Object.entries(towns).sort((a, b) => b[1] - a[1])[0];
  areaName = best ? best[0].replace(/[\[\]]/g, '') : null;
}
// What this search cost on the outside services, for the admin's statistics. An answer only counts as a request when the
// service really answered (the nodes that were skipped call an invalid address and return an error), and a node that did
// not run on this path (a drawn area has no geocoding) counts for nothing.
const answered = (name, key) => { try { return $(name).all().filter(i => i.json && i.json[key] !== undefined).length; } catch (e) { return 0; } };
const gemini = { calls: 0, inputTokens: 0, outputTokens: 0 };
try {
  for (const i of $('AI Check').all()) {
    const u = i.json && i.json.usageMetadata;
    if (!u) continue;
    gemini.calls += 1;
    gemini.inputTokens += u.promptTokenCount || 0;
    gemini.outputTokens += (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
  }
} catch (e) { /* no AI check on this path */ }
const meter = {
  gemini,
  serper: { calls: answered('Maps Search', 'searchParameters') + answered('Web Search', 'searchParameters') },
  geoapify: { calls: answered('Geocode City', 'results') + answered('Geoapify Places', 'features') },
};
return [{ json: { jobId, leads: out, areaName, meter } }];
`.trim();

const callbackUrl = "={{ $('Webhook').first().json.body.callbackUrl }}";
const geoQueryAuth = { authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth' };
// Fetch up to 10 sites at once so slow websites do not add up. A short timeout keeps one dead site from stalling a search.
const pageFetchOptions = {
  timeout: 6000,
  response: { response: { responseFormat: 'text' } },
  batching: { batch: { batchSize: 10, batchInterval: 0 } }
};

const workflow = {
  name: 'Lead Finder Backend',
  nodes: [
    {
      parameters: {
        httpMethod: 'POST', path: 'find-leads', authentication: 'headerAuth',
        responseMode: 'onReceived', options: {}
      },
      id: 'n1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
      webhookId: 'find-leads-backend'
    },
    {
      parameters: { jsCode: expandAreasCode },
      id: 'n15', name: 'Expand Areas', type: 'n8n-nodes-base.code', typeVersion: 2, position: [110, 0]
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
          conditions: [{
            id: 'has-bbox', leftValue: '={{ $json.bbox ? "yes" : "no" }}', rightValue: 'yes',
            operator: { type: 'string', operation: 'equals' }
          }],
          combinator: 'and'
        },
        options: {}
      },
      id: 'n16', name: 'Is Map Area', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [220, -120]
    },
    {
      parameters: {
        url: 'https://api.geoapify.com/v1/geocode/search', ...geoQueryAuth,
        sendQuery: true, specifyQuery: 'json',
        jsonQuery: "={{ JSON.stringify({ text: $json.text, limit: 1, format: 'json' }) }}"
      },
      id: 'n9', name: 'Geocode City', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [330, 80],
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: queryCode },
      id: 'n10', name: 'Build Query', type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, 0]
    },
    {
      parameters: {
        // only when Google Maps gave nothing for this area (no credits left, service down, empty result)
        url: "={{ ($json.places && $json.places.length) || !$('Build Query').item.json.geo ? 'http://invalid.invalid/' : 'https://api.geoapify.com/v2/places' }}",
        ...geoQueryAuth,
        sendQuery: true, specifyQuery: 'json',
        jsonQuery: "={{ (q => JSON.stringify({ categories: q.categories, filter: q.filter, limit: 20, ...(q.name ? { name: q.name } : {}) }))($('Build Query').item.json) }}"
      },
      id: 'n2', name: 'Geoapify Places', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [770, 0],
      onError: 'continueRegularOutput'
    },
    {
      parameters: {
        method: 'POST', url: 'https://google.serper.dev/maps',
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.maps || {}) }}',
        options: { timeout: 15000 }
      },
      id: 'n19', name: 'Maps Search', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [600, 0],
      credentials: { httpHeaderAuth: { id: 'cU0NuC0Q0GMMLVkw', name: 'Header Auth account 7' } },
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: prepareCode },
      id: 'n3', name: 'Prepare', type: 'n8n-nodes-base.code', typeVersion: 2, position: [880, 0]
    },
    {
      parameters: {
        method: 'POST',
        url: "={{ $json.lookup ? 'https://google.serper.dev/search' : 'http://invalid.invalid/' }}",
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ q: $json.lookupQuery || "", num: 10 }) }}',
        options: { timeout: 10000, batching: { batch: { batchSize: 8, batchInterval: 0 } } }
      },
      id: 'n17', name: 'Web Search', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [990, 160],
      credentials: { httpHeaderAuth: { id: 'cU0NuC0Q0GMMLVkw', name: 'Header Auth account 7' } },
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: matchLookupCode },
      id: 'n18', name: 'Match Lookup', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1100, 160]
    },
    {
      parameters: { url: "={{ $json.fetchUrl || 'http://invalid.invalid/' }}", options: pageFetchOptions },
      id: 'n4', name: 'Fetch Website', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1100, 0],
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: findContactCode },
      id: 'n11', name: 'Find Contact Link', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1320, 0]
    },
    {
      parameters: { url: "={{ $json.contactUrl || 'http://invalid.invalid/' }}", options: pageFetchOptions },
      id: 'n12', name: 'Fetch Contact Page', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1540, 0],
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: extractCode },
      id: 'n5', name: 'Extract', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1760, 0]
    },
    {
      parameters: { jsCode: scoreCode },
      id: 'n6', name: 'Score', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1980, 0]
    },
    {
      parameters: { jsCode: aiPromptCode },
      id: 'n20', name: 'AI Prompt', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2090, 160]
    },
    {
      parameters: {
        method: 'POST',
        url: "={{ $json.prompt ? '" + AI_URL + "' : 'http://invalid.invalid/' }}",
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: "={{ JSON.stringify({ contents: [{ parts: [{ text: $json.prompt || '' }] }], generationConfig: { responseMimeType: 'application/json', temperature: " + FIT.data.config.temperature + ", maxOutputTokens: " + FIT.data.config.maxOutputTokens + " } }) }}",
        options: { timeout: 30000 }
      },
      id: 'n21', name: 'AI Check', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [2200, 160],
      credentials: { httpHeaderAuth: { id: 'zl08YnKaBcKVRKg0', name: 'Header Auth account 6' } },
      retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
      onError: 'continueRegularOutput'
    },
    {
      parameters: { jsCode: applyAiCode },
      id: 'n22', name: 'Apply AI', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2310, 160]
    },
    {
      parameters: { jsCode: formatCode },
      id: 'n7', name: 'Format', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2200, 0]
    },
    {
      parameters: {
        method: 'POST', url: callbackUrl,
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json) }}'
      },
      id: 'n8', name: 'Send Results to Backend', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [2440, 0]
    }
  ],
  connections: {
    'Webhook': { main: [[{ node: 'Expand Areas', type: 'main', index: 0 }]] },
    'Expand Areas': { main: [[{ node: 'Is Map Area', type: 'main', index: 0 }]] },
    'Is Map Area': { main: [
      [{ node: 'Build Query', type: 'main', index: 0 }],
      [{ node: 'Geocode City', type: 'main', index: 0 }]
    ] },
    'Geocode City': { main: [[{ node: 'Build Query', type: 'main', index: 0 }]] },
    'Build Query': { main: [[{ node: 'Maps Search', type: 'main', index: 0 }]] },
    'Maps Search': { main: [[{ node: 'Geoapify Places', type: 'main', index: 0 }]] },
    'Geoapify Places': { main: [[{ node: 'Prepare', type: 'main', index: 0 }]] },
    'Prepare': { main: [[{ node: 'Web Search', type: 'main', index: 0 }]] },
    'Web Search': { main: [[{ node: 'Match Lookup', type: 'main', index: 0 }]] },
    'Match Lookup': { main: [[{ node: 'Fetch Website', type: 'main', index: 0 }]] },
    'Fetch Website': { main: [[{ node: 'Find Contact Link', type: 'main', index: 0 }]] },
    'Find Contact Link': { main: [[{ node: 'Fetch Contact Page', type: 'main', index: 0 }]] },
    'Fetch Contact Page': { main: [[{ node: 'Extract', type: 'main', index: 0 }]] },
    'Extract': { main: [[{ node: 'Score', type: 'main', index: 0 }]] },
    'Score': { main: [[{ node: 'AI Prompt', type: 'main', index: 0 }]] },
    'AI Prompt': { main: [[{ node: 'AI Check', type: 'main', index: 0 }]] },
    'AI Check': { main: [[{ node: 'Apply AI', type: 'main', index: 0 }]] },
    'Apply AI': { main: [[{ node: 'Format', type: 'main', index: 0 }]] },
    // The backend tells the owner on Telegram when the results arrive (SearchNotifier), so n8n holds no Telegram token.
    'Format': { main: [[{ node: 'Send Results to Backend', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

fs.mkdirSync('n8n', { recursive: true });
fs.writeFileSync('n8n/lead-finder.workflow.json', JSON.stringify(withDeployIds(workflow), null, 2));
console.log('written');
