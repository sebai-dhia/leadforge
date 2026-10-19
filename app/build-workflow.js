// Generates n8n/lead-finder.workflow.json for the Spring Boot backend (run: node build-workflow.js)
// Flow: Webhook (responds at once) -> geocode city -> Geoapify places -> fetch home page and contact page
//       -> rule-based score -> POST results to the backend callback.
const fs = require('fs');
const { SAFE_URL, CONTACT_LINK, SCRAPE, AUDIT, NAME_MATCH, DIRECTORY_HOSTS } = require('./workflow-snippets');

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
const out = [];
for (const item of $input.all()) {
  const j = item.json || {};
  if (j.bbox) {
    out.push({ json: { filter: 'rect:' + j.bbox, categories, name } });
  } else {
    const g = (j.results || [])[0];
    if (g) out.push({ json: { filter: 'circle:' + g.lon + ',' + g.lat + ',10000', categories, name } });
  }
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
const seen = new Set();
const feats = [];
for (const item of $input.all()) {
  for (const f of ((item.json && item.json.features) || [])) {
    if (!f.properties || !f.properties.name) continue;
    // a name that is only a category word is not a business a freelancer can write to
    if (/^(restaurants?|fast ?food|caf[eé]s?|hotels?|pharmacy|pharmacies|shop|store|market|bakery|salon|gym|clinic)$/i.test(f.properties.name.trim())) continue;
    const key = f.properties.place_id || (f.properties.name + '|' + f.properties.formatted);
    if (seen.has(key)) continue;
    seen.add(key);
    feats.push(f);
  }
}
if (!feats.length) return [{ json: { _empty: true } }];
const fix = u => (u && !/^https?:\/\//i.test(u) ? 'http://' + u : u) || null;
return feats.map(f => {
  const p = f.properties, c = p.contact || {}, raw = (p.datasource && p.datasource.raw) || {};
  const website = fix(p.website || c.website || raw.website || raw['contact:website'] || null);
  return { json: {
    placeId: p.place_id || null,
    name: p.name,
    address: p.address_line2 || p.formatted || null,
    phone: p.phone || c.phone || raw.phone || raw['contact:phone'] || null,
    osmEmail: c.email || p.email || raw.email || raw['contact:email'] || null,
    rating: null,
    reviews: 0,
    website,
    // a social page is not a website: skip fetching it, the lead keeps the link
    fetchUrl: /(facebook|instagram|linktr)./i.test(website || '') ? null : safeUrl(website),
    niche: body.niche, city: body.city,
    service: body.service, sender: body.sender
  }};
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
  const social = [...new Set([...(lead.foundSocial || []), ...a.social, ...b.social])].slice(0, 6);
  const phone = lead.phone || a.phones[0] || b.phones[0] || lead.foundPhone || null;
  const out = { ...lead, phone, emails: emails.slice(0, 8), social, hasBooking: a.hasBooking || b.hasBooking, siteChecked: a.length > 0, audit: audit(homeHtml) };
  for (const k of ['foundWebsite', 'foundSocial', 'foundPhone', 'lookup', 'lookupQuery', 'cached']) delete out[k];
  delete out.osmEmail; delete out.fetchUrl;
  return { json: out };
});
`.trim();

const scoreCode = String.raw`
// Fit score (1-10) for what THIS freelancer sells. The focus comes from the offer text in the request.
const body = $('Webhook').first().json.body || {};
const offer = String(body.service || '').toLowerCase();
const focus = /strateg|social media|copywrit|content|brand/.test(offer) ? 'creative' : /\bux\b|\bui\b|design|logo/.test(offer) ? 'design' : 'dev';
return $input.all().map(item => {
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
  const flags = [];
  let score = 2;

  if (focus === 'design') {
    if (noSite) { score += 4; flags.push('no website to design from'); }
    else if (brokenSite) { score += 3; flags.push('website could not be loaded'); }
    else if (au) {
      let weak = 0;
      if (au.noViewport) { weak += 3; flags.push('site is not mobile-friendly'); }
      if (au.legacyMarkup) { weak += 3; flags.push('dated page layout'); }
      if (au.stale) { weak += 2; flags.push('site looks outdated'); }
      if (au.thin) { weak += 2; flags.push('very thin or unfinished site'); }
      score += Math.min(weak, 5);
      if (!weak) { score -= 1; flags.push('site looks modern'); }
    }
  } else if (focus === 'creative') {
    if (!hasSocial) { score += 3; flags.push('no social page found'); }
    if (noSite) { score += 1; flags.push('no website'); }
    else if (au && au.noPreview) { score += 1; flags.push('no social preview image on the site'); }
    if (au && (au.noViewport || au.legacyMarkup || au.stale)) { score += 1; flags.push('weak online presence'); }
    if (hasSocial && !flags.length) { score -= 1; flags.push('active online presence'); }
  } else {
    if (noSite) { score += 4; flags.push('no website (needs a build)'); }
    else if (brokenSite) { score += 3; flags.push('website could not be loaded'); }
    else if (au) {
      if (au.outdatedSoftware) { score += 3; flags.push('outdated software detected'); }
      if (!l.hasBooking && (appointment || food)) { score += 2; flags.push('no online booking or ordering'); }
      else if (l.hasBooking) { score -= 1; flags.push('website already mentions online booking'); }
      if (au.noViewport) { score += 1; flags.push('site is not mobile-friendly'); }
    }
  }

  if (appointment || food) score += 1;
  if (/group|groupe|international|global|network|holding|banque|bank|assurance|insurance|corporate/i.test(l.name || '')) { score -= 2; flags.push('looks like a large organisation'); }

  // Reachability: a good opportunity you cannot contact is worth little
  if (isReachable) score += (hasPhone && hasEmail ? 2 : 1);
  else { score = Math.min(score, 3); flags.push('unreachable: no phone or email found yet'); }

  score = Math.max(1, Math.min(10, score));
  const why = appointment ? 'Appointment-based business' : food ? 'Reservation and ordering business' : 'Local business';
  return { json: { ...l, score, reason: why + ': ' + (flags.length ? flags.join(', ') : 'no clear opportunity seen') + '.' } };
});
`.trim();

const formatCode = String.raw`
const jobId = $('Webhook').first().json.body.jobId;
const out = $input.all().map(i => i.json).filter(l => !l._empty).map(l => {
  const r = { ...l, subject: '', emailBody: '' };
  for (const k of ['niche', 'city', 'service', 'sender', 'hasBooking', 'siteChecked', 'fetchUrl', 'audit', 'lookedUp']) delete r[k];
  return r;
});
out.sort((a, b) => {
  const aReachable = Boolean(a.phone || (a.emails && a.emails.length) || (a.social && a.social.length));
  const bReachable = Boolean(b.phone || (b.emails && b.emails.length) || (b.social && b.social.length));
  if (aReachable !== bReachable) return bReachable ? 1 : -1;
  return b.score - a.score;
});
return [{ json: { jobId, leads: out } }];
`.trim();

const telegramAlertCode = String.raw`
const webhookBody = $('Webhook').first().json.body || {};
const input = $input.first().json || {};
const leads = input.leads || [];

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const niche = esc(webhookBody.niche || 'N/A');
const location = esc(webhookBody.city || (webhookBody.bbox ? 'Map Bounding Box' : 'N/A'));
const total = leads.length;
const reachable = leads.filter(l => Boolean(l.phone || (l.emails && l.emails.length) || (l.social && l.social.length))).length;

let html = '🎯 <b>Leadforge Alert: New Leads Discovered!</b>\n\n';
html += '📍 <b>Niche:</b> ' + niche + '\n';
html += '🌍 <b>Location:</b> ' + location + '\n';
html += '📊 <b>Found:</b> ' + total + ' leads (' + reachable + ' reachable)\n\n';

if (leads.length > 0) {
  html += '🔥 <b>Top Opportunities:</b>\n';
  const top = leads.slice(0, 3);
  top.forEach((l, idx) => {
    const contact = esc(l.phone || (l.emails && l.emails[0]) || (l.website ? 'Website listed' : 'No contact found'));
    html += (idx + 1) + '. <b>' + esc(l.name || 'Unnamed') + '</b> (Score: ' + (l.score || 0) + '/10)\n   📞 ' + contact + '\n';
  });
} else {
  html += '⚠️ <i>No leads were found for this search.</i>';
}

return [{ json: { chatId: '5285518045', text: html } }];
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
        url: 'https://api.geoapify.com/v2/places', ...geoQueryAuth,
        sendQuery: true, specifyQuery: 'json',
        jsonQuery: "={{ JSON.stringify({ categories: $json.categories, filter: $json.filter, limit: 20, ...($json.name ? { name: $json.name } : {}) }) }}"
      },
      id: 'n2', name: 'Geoapify Places', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [660, 0],
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
    },
    {
      parameters: { jsCode: telegramAlertCode },
      id: 'n13', name: 'Build Telegram Alert', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2440, 160]
    },
    {
      parameters: {
        chatId: '5285518045',
        text: '={{ $json.text }}',
        additionalFields: {
          parse_mode: 'HTML'
        }
      },
      id: 'n14', name: 'Telegram Alert', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [2680, 160],
      onError: 'continueRegularOutput',
      credentials: {
        telegramApi: {
          id: 'telegramApi',
          name: 'Telegram account'
        }
      }
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
    'Build Query': { main: [[{ node: 'Geoapify Places', type: 'main', index: 0 }]] },
    'Geoapify Places': { main: [[{ node: 'Prepare', type: 'main', index: 0 }]] },
    'Prepare': { main: [[{ node: 'Web Search', type: 'main', index: 0 }]] },
    'Web Search': { main: [[{ node: 'Match Lookup', type: 'main', index: 0 }]] },
    'Match Lookup': { main: [[{ node: 'Fetch Website', type: 'main', index: 0 }]] },
    'Fetch Website': { main: [[{ node: 'Find Contact Link', type: 'main', index: 0 }]] },
    'Find Contact Link': { main: [[{ node: 'Fetch Contact Page', type: 'main', index: 0 }]] },
    'Fetch Contact Page': { main: [[{ node: 'Extract', type: 'main', index: 0 }]] },
    'Extract': { main: [[{ node: 'Score', type: 'main', index: 0 }]] },
    'Score': { main: [[{ node: 'Format', type: 'main', index: 0 }]] },
    'Format': {
      main: [
        [
          { node: 'Send Results to Backend', type: 'main', index: 0 },
          { node: 'Build Telegram Alert', type: 'main', index: 0 }
        ]
      ]
    },
    'Build Telegram Alert': {
      main: [
        [
          { node: 'Telegram Alert', type: 'main', index: 0 }
        ]
      ]
    }
  },
  settings: { executionOrder: 'v1' }
};

fs.mkdirSync('n8n', { recursive: true });
fs.writeFileSync('n8n/lead-finder.workflow.json', JSON.stringify(workflow, null, 2));
console.log('written');
