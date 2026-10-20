// Builds the request in two parts: the fixed instructions (system) and the facts of this one message (prompt).
// The text itself, the examples, the limits and the tone live in prompts/draft/ (PROMPTS, with render(), is put in front of this code).
const b = $('Webhook').first().json.body || {};
const plan = $('Plan Fetch').all().map(i => i.json);
const pages = $input.all().map(i => i.json);

const C = PROMPTS.data.config;
const F = PROMPTS.data.facts;
const L = C.limits;
const D = C.delimiters;

// Everything that is copied from outside (profile text, business data, web pages) loses the characters
// that could pass for markup and is cut short.
const clean = (s, n = 300) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/[<>{}\[\]`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const list = a => (Array.isArray(a) ? a : []).map(x => clean(x, L.listItem)).filter(Boolean);
/** One line of facts from its template in prompts/draft/facts.json. */
const line = (template, value) => render(template, { value, open: D.open, close: D.close });

/** A web page as a few plain facts: its title, description and main headings. */
function pageFacts(html) {
  html = typeof html === 'string' ? html : '';
  if (html.length < 50) return '';
  const first = (...res) => { for (const re of res) { const m = html.match(re); if (m && m[1]) return m[1]; } return ''; };
  const strip = s => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#?\w+;/g, ' ');
  const title = first(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = first(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["']/i,
    /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)/i);
  const heads = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)].slice(0, 4).map(m => strip(m[1]));
  const parts = [...new Set([title, desc, ...heads].map(x => clean(strip(x), L.pageFact)).filter(x => x.length > 2))];
  return parts.join(' - ').slice(0, L.pageFacts);
}

// ---- what the pages said
let businessSays = '';
const senderPages = [];
let senderTried = false;
plan.forEach((p, i) => {
  const facts = pageFacts(pages[i] && pages[i].data);
  if (p.kind === 'business') businessSays = facts;
  if (p.kind === 'sender') { senderTried = true; if (facts) senderPages.push((p.label ? p.label + ': ' : '') + facts); }
});
// '-' means "looked, nothing readable": the backend keeps it so the pages are not read again for every message
const knowledgeNew = senderTried ? (senderPages.join('\n').slice(0, L.knowledge) || '-') : null;
const senderKnowledge = (b.linksKnowledge && b.linksKnowledge !== '-') ? b.linksKnowledge : (knowledgeNew && knowledgeNew !== '-' ? knowledgeNew : '');

// ---- language and channel
const lang = C.languages[b.language] ? b.language : 'en';
const channel = b.channel === 'whatsapp' ? 'whatsapp' : 'email';
const wa = channel === 'whatsapp';
const limits = { words: C.channels[channel].words, subjectWords: C.channels[channel].subjectWords };
// the example matches the situation: a business without a website, or one that has a website (then only a question)
const host = String(b.website || '').replace(/^https?:\/\//i, '').split('/')[0];
// does the sender sell websites or anything built on them? Only then is a missing website a reason to write
const WEB = /\b(web|websites?|sites?|e-?commerce|shop|booking|landing|wordpress|seo|full.?stack|front.?end|back.?end|developer|development|apps?|ux|ui)\b/i;
const webOffer = WEB.test([b.offer, b.headline, b.about, ...(Array.isArray(b.services) ? b.services : [])].join(' '));
const exampleSource = PROMPTS.data.examples[lang][channel][webOffer ? (host ? 'website' : 'nosite') : 'other'];
const exampleText = render(C.channels[channel].example, { subject: exampleSource.subject, body: exampleSource.body, words: limits.words, subjectWords: limits.subjectWords });

// ---- facts about the sender
const senderName = clean(b.senderName, L.senderName);
const headline = clean(b.headline, L.headline);
const senderCity = clean(b.senderCity, L.senderCity);
const about = clean(b.about, L.about);
const services = list(b.services);
const targets = list(b.targets);
const offer = clean(b.offer, L.offer);
const sender = [
  senderName ? line(F.sender.name, senderName) : F.sender.nameUnknown,
  headline ? line(F.sender.headline, headline) : null,
  senderCity ? line(F.sender.city, senderCity) : null,
  services.length ? line(F.sender.services, services.join('; ')) : (offer ? line(F.sender.offer, offer) : null),
  about && about !== offer ? line(F.sender.about, about) : null,
  targets.length ? line(F.sender.targets, targets.join('; ')) : null,
  senderKnowledge ? line(F.sender.pages, clean(senderKnowledge, L.knowledge)) : null,
].filter(Boolean).join('\n');

// ---- facts about the business
const rating = Number(b.rating) || 0;
const reviews = Number(b.reviews) || 0;
const tier = F.reputation.find(t => reviews >= t.minReviews && rating >= t.minRating);
const reputation = tier ? tier.text : F.reputationNone;
const socialNames = [...new Set((Array.isArray(b.social) ? b.social : []).map(u => /instagram/i.test(u) ? 'Instagram' : /facebook/i.test(u) ? 'Facebook' : null).filter(Boolean))];
const sigMatch = String(b.reason || '').match(/\[\[sig:(gap|pain|neglect|momentum)\]\]/);
const approach = ['missing', 'success', 'fresh', 'timing', 'tip', 'curiosity'].includes(b.approach) ? b.approach : '';
const userNote = clean(b.note, L.userNote);
// a chosen approach wins over the group the AI check found
const signalText = approach ? F.approaches[approach] : (sigMatch ? F.signals[sigMatch[1]] : '');
const reason = clean(String(b.reason || '').replace(/\s*\[\[fr:.*?\]\]/g, '').replace(/\s*\[\[sig:\w+\]\]/g, ''), L.reason);
const aiAt = reason.indexOf(' AI: ');
const checks = (aiAt >= 0 ? reason.slice(0, aiAt) : reason).replace(/^[^:]*:\s*/, '');
const aiNote = aiAt >= 0 ? reason.slice(aiAt + 5) : '';
const business = [
  line(F.business.name, clean(b.leadName, L.leadName)),
  b.niche ? line(F.business.type, clean(b.niche, L.type)) : null,
  b.address ? line(F.business.address, clean(b.address, L.address)) : null,
  line(F.business.reputation, reputation),
  webOffer ? (host ? line(F.business.website, clean(host, L.host)) : F.business.noWebsite) : F.business.notWeb,
  socialNames.length ? line(F.business.social, socialNames.join(', ')) : null,
  businessSays ? line(F.business.says, businessSays) : null,
  // the internal notes talk about websites: they are only given to a sender who sells them
  webOffer && checks ? line(F.business.checks, checks) : null,
  aiNote && (webOffer || !/web ?site|site web|موقع/i.test(aiNote)) ? line(F.business.aiNote, aiNote) : null,
  signalText ? line(F.business.signal, signalText) : null,
  userNote ? line(F.business.userNote, userNote) : null,
].filter(Boolean).join('\n');

const system = render(PROMPTS.templates.system, { open: D.open, close: D.close });
const prompt = render(PROMPTS.templates.user, {
  sender,
  business,
  language_name: C.languages[lang].name,
  language_tone: C.languages[lang].tone,
  channel_line: render(C.channels[channel].line, { words: limits.words, subjectWords: limits.subjectWords }),
  example: exampleText,
});

return [{ json: {
  system, prompt, knowledgeNew, linksHash: b.linksHash || '', lang, channel, limits, senderName,
  businessName: clean(b.leadName, L.leadName), hasWebsite: !!host, webOffer, promptVersion: PROMPTS.version,
} }];
