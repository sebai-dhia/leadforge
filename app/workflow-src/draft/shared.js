// Reading the AI answer and checking it against the rules. Used by the Check and Finalize nodes.
function parseAi(r) {
  try {
    const raw = (r && r.candidates && r.candidates[0].content.parts.map(p => p.text || '').join('')) || '';
    const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    if (o && typeof o.body === 'string' && o.body.trim()) {
      return { angle: String(o.angle || '').trim(), subject: String(o.subject || '').trim(), body: o.body.trim() };
    }
  } catch (e) { /* no usable answer */ }
  return null;
}

/**
 * The first usable answer among the model attempts (the fast model, then the fallbacks), which attempt gave it,
 * and whether any model replied at all. Attempts that were skipped or failed have no usable answer.
 */
function firstAnswer() {
  const names = ['AI Write Message', 'AI Write B', 'AI Write C'];
  let replied = false;
  for (let i = 0; i < names.length; i++) {
    let json = null;
    try { json = $(names[i]).first().json; } catch (e) { continue; }
    if (json && json.candidates) replied = true;
    const answer = parseAi(json);
    if (answer) return { answer, index: i, replied };
  }
  return { answer: null, index: 0, replied };
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const words = s => String(s || '').split(/\s+/).filter(Boolean).length;

/** The ways the message breaks the rules, as short sentences the AI can act on. Empty when it is fine. */
function lint(o, ctx) {
  const problems = [];
  if (!o) return ['it was not a usable JSON answer with a body'];
  const wa = ctx.channel === 'whatsapp';
  const body = o.body;
  // the business name and the sender name are allowed to contain digits or capitals
  let plain = body;
  for (const name of [ctx.businessName, ctx.senderName]) {
    if (name && name.length >= 2) plain = plain.split(name).join(' ');
  }
  // a number that belongs to a name ("Hotel Best Night 2") is fine even when the AI shortens or respells the rest of the name
  const nameNumbers = [...new Set([ctx.businessName, ctx.senderName].join(' ').match(/\d+/g) || [])];
  if (nameNumbers.length) plain = plain.replace(new RegExp('(?<!\\d)(' + nameNumbers.join('|') + ')(?!\\d)', 'g'), ' ');

  const max = Math.round(ctx.limits.words * 1.1);
  if (words(body) > max) problems.push('it is too long (' + words(body) + ' words, at most ' + ctx.limits.words + ')');
  if (!wa) {
    if (!o.subject) problems.push('the email needs a subject');
    else if (words(o.subject) > ctx.limits.subjectWords + 1) problems.push('the subject is too long (at most ' + ctx.limits.subjectWords + ' words)');
  }
  if (/\d/.test(plain)) problems.push('it contains numbers; use none');
  if (/(https?:\/\/|www\.|\S+@\S+\.\S+)/i.test(body)) problems.push('it contains a web or email address');
  if (/[\[\]{}<>]/.test(body)) problems.push('it contains brackets or placeholders');
  if (/!/.test(body)) problems.push('it contains an exclamation mark');
  if (/\p{Extended_Pictographic}/u.test(body)) problems.push('it contains an emoji');

  if (/\bI (have |had )?(noticed|saw|see|visited|looked at|checked|reviewed|came across)\b/i.test(body)
    || /(^|[^\p{L}])je (vois|constate)(?!\p{L})/iu.test(body)
    || /(^|[^\p{L}])j['’](ai|avais) (vu|remarqué|constaté|visité|consulté|regardé)(?!\p{L})/iu.test(body)
    || /(لاحظت|رأيت|شاهدت|زرت)/.test(body)) problems.push('it claims to have noticed, seen or visited something');
  if (/\byou (do not|don't|dont) have (a|any)\b/i.test(body) || /\bvous n['’]avez pas (de|d['’]|un|une)/i.test(body)
    || /(ليس لديكم|لا تملكون)/.test(body)) problems.push('it says the business lacks something; say only that you could not find it, or ask');
  if (/google maps/i.test(body)) problems.push('it quotes an internal note (Google Maps); say nothing about where the information came from');
  if (/\bI hope (this|you)\b/i.test(body) || /\bj['’]espère que (vous|ce message)/i.test(body)) problems.push('it opens with a cliche');

  // a business with a website: a gap is never claimed, only asked about
  if (ctx.hasWebsite && (/\bI (could not|couldn't|cannot|can't) find\b/i.test(body) || /\bje n['’]ai pas trouvé/i.test(body) || /لم أجد/.test(body))) {
    problems.push('the business has a website, so do not say you could not find something; ask a question instead');
  }
  const letters = body.replace(/[^\p{L}]/gu, '');
  const arabic = (body.match(/[؀-ۿ]/g) || []).length;
  if (ctx.lang === 'ar' && letters && arabic / letters.length < 0.6) problems.push('it is not written in Arabic');
  if (ctx.lang === 'fr' && body.length > 120 && (body.match(/[àâçéèêëîïôùûü]/gi) || []).length < 2) problems.push('the French is missing its accents');
  if (ctx.lang === 'fr' && (plain.match(/\b(the|and|your|with|you|our)\b/gi) || []).length >= 2) problems.push('it is not written in French');
  if (ctx.lang === 'en' && ((plain.match(/\b(vous|votre|nous|pour|avec|merci)\b/gi) || []).length >= 2 || arabic > 3)) problems.push('it is not written in English');

  const firstLine = body.split('\n')[0].trim();
  if (words(firstLine) > 4) problems.push('the greeting must be a single short line, such as "Bonjour,"');
  if (ctx.businessName && ctx.businessName.length >= 3 && norm(firstLine).includes(norm(ctx.businessName))) problems.push('the greeting contains the business name');
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  // in Arabic the name is written in Arabic letters, so only the shape is checked there: a short last line
  const last = lines[lines.length - 1] || '';
  const signed = ctx.lang === 'ar' ? words(last) <= 4 : norm(last).includes(norm(ctx.senderName));
  if (ctx.senderName && !wa && !signed) problems.push('it must end with the sender name on its own line');
  // a WhatsApp message ends with its question: a last line that is only a name is a signature block
  const nameLine = ctx.lang === 'ar' ? words(last) <= 3 && !/[?؟.!]$/.test(last) : norm(last).includes(norm(ctx.senderName)) && words(last) <= 5;
  if (ctx.senderName && wa && lines.length > 1 && nameLine) problems.push('a WhatsApp message does not end with a name line: end with the question');
  return problems;
}
