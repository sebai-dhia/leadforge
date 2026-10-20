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
// the name as a person would say it: the part before " - ", " | " or " : " (Maps names often carry a tagline), never an underscore
// A name written in two scripts ("Cabinet Hammami-المحامي مكتب ...") is cut to the script of the message:
// Latin for French and English, Arabic for Arabic. The AI is never asked to choose between two spellings.
const ARABIC_RUN = /[-–—|:\/]?[ \t]*[؀-ۿݐ-ݿ][؀-ۿݐ-ݿ \t.,،()]*/g;
const LATIN_RUN = /[-–—|:\/]?[ \t]*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’.& \t]*/g;
let fullName = clean(b.leadName, L.leadName).replace(/_/g, ' ');
const hasArabic = /[؀-ۿ]/.test(fullName);
const hasLatin = /[A-Za-zÀ-ÿ]/.test(fullName);
const tidy = t => t.replace(/\s+/g, ' ').replace(/^[-–—|:\/\s]+|[-–—|:\/\s]+$/g, '');
// a name only in Arabic letters cannot be written inside a French or English message: the message says "your clinic" instead
let arabicOnlyName = false;
if (hasArabic && hasLatin) {
  if (lang === 'ar') {
    // in an Arabic message the Arabic spelling is used when it is a real name (three words or more); a short Arabic tagline next to a Latin brand is dropped
    const arabicPart = tidy(fullName.replace(LATIN_RUN, ' '));
    if (arabicPart.split(' ').length >= 3) fullName = arabicPart;
  } else {
    const latinPart = tidy(fullName.replace(ARABIC_RUN, ' '));
    if (latinPart.length >= 2) fullName = latinPart;
  }
} else if (hasArabic && lang !== 'ar') arabicOnlyName = true;
const SEPARATOR = /\s+[-–—|:\/]\s+/;
// words that tell French from English in a business name (accents ignored by the second pass)
const FR_NAME = /\b(cabinet|clinique|dentaire|dentiste|avocats?|pharmacie|agence|immobili[eè]re?|boulangerie|p[aâ]tisserie|institut|[ée]cole|ma[iî]tre|docteur|fleuriste|magasin|soci[ée]t[ée]|salle|coiffure|assurances?|opticien)\b/gi;
const EN_NAME = /\b(clinic|dental|dentist|law|firm|lawyers?|pharmacy|agency|real|estate|bakery|school|center|store|florist|hairdresser|doctor|optician|travel|insurance|studio|office)\b/gi;
const nameLanguage = s => { const f = (s.match(FR_NAME) || []).length, e = (s.match(EN_NAME) || []).length; return f > e ? 'fr' : e > f ? 'en' : ''; };
// "Pharmacie Centrale / Central Pharmacy": the same name twice. Keep the version in the message language, never both.
const nameParts = fullName.split(SEPARATOR).map(s => s.trim()).filter(Boolean);
const firstPart = nameParts[0] || fullName;
// The first part is the brand. It is replaced only when it is in the other language and a later part, in the message language,
// is nearly as long: then it is the same name written again, not a tagline ("... Law Firm - Avocat Tunisie").
const sameNameAgain = lang === 'ar' ? undefined : nameParts.slice(1).find(s => nameLanguage(s) === lang && s.length >= firstPart.length * 0.6);
const shortName = nameLanguage(firstPart) && nameLanguage(firstPart) !== lang && sameNameAgain ? sameNameAgain : firstPart;
// a tagline after a dash or a bar is dropped; a very short first part keeps the whole name
const businessName = arabicOnlyName ? '' : shortName.length >= 6 ? shortName : fullName.replace(new RegExp(SEPARATOR.source, 'g'), ' ');
// a name that still mixes the two languages (no separator to cut at) is flagged so the message writes one version only
const nameBilingual = !arabicOnlyName && (businessName.match(FR_NAME) || []).length > 0 && (businessName.match(EN_NAME) || []).length > 0;
const business = [
  arabicOnlyName ? F.business.nameArabicOnly : line(F.business.name, businessName),
  nameBilingual ? F.business.nameBilingual : null,
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
  businessName, nameBilingual, hasWebsite: !!host, webOffer, promptVersion: PROMPTS.version,
} }];
