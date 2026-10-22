// Picks the answer to send back: the first one when it was fine, otherwise the second try if it is better.
const ctx = $('Build Prompt').first().json;
const check = $('Check').first().json;
const found = firstAnswer();
const first = found.answer || parseAi($('AI Write Message').first().json);
const retry = check.retryPrompt ? parseAi($input.first().json) : null;

// What the AI calls cost: Gemini reports the tokens of every answer it gave (the models tried in turn, then the second try).
// The backend keeps this for the admin's statistics. A model that was skipped or failed has no usageMetadata and is not counted.
const meter = (() => {
  const answers = [];
  for (const name of ['AI Write Message', 'AI Write B', 'AI Write C']) {
    try { answers.push($(name).first().json); } catch (e) { /* this workflow has fewer models */ }
  }
  answers.push($input.first().json);
  const gemini = { calls: 0, inputTokens: 0, outputTokens: 0 };
  for (const a of answers) {
    const u = a && a.usageMetadata;
    if (!u) continue;
    gemini.calls += 1;
    gemini.inputTokens += u.promptTokenCount || 0;
    gemini.outputTokens += (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
  }
  return { gemini };
})();

let chosen = first;
if (check.retryPrompt) {
  const second = lint(retry, ctx);
  const firstProblems = lint(first, ctx);
  if (retry && (!first || second.length <= firstProblems.length)) chosen = retry;
}
if (!chosen) return [{ json: { error: true, message: 'The AI did not return a usable message', meter } }];

// the last guard: dashes used as punctuation become commas, underscores become spaces
const FOREIGN_RUN = /[-–—|:\/]?[ \t]*(?:(?![\p{Script=Latin}\p{Script=Arabic}])\p{L})(?:(?![\p{Script=Latin}\p{Script=Arabic}])\p{L}|[ \t.,()\p{M}])*/gu;
const withoutForeign = t => t.replace(FOREIGN_RUN, ' ').replace(/ {2,}/g, ' ').replace(/ ([.,])/g, '$1');
const withoutArabic = t => (ctx.lang === 'ar' ? t : t.replace(/[-–—|:]?[ \t]*[؀-ۿݐ-ݿ][؀-ۿݐ-ݿ \t.,،()]*/g, ' ').replace(/ {2,}/g, ' ').replace(/ ([.,])/g, '$1'));
const plainText = t => withoutArabic(withoutForeign(String(t || ''))).replace(/\s+[—–-]\s+/g, ', ').replace(/[—–]/g, ', ').replace(/_/g, ' ').replace(/,\s*,/g, ',');
// The last guard for an email: it ends with one of the closings, never with the sender's name. A last line that is only the
// name (or any short line without a sentence ending) is replaced by the first closing; when there is none, the closing is added.
const closings = Array.isArray(ctx.closings) ? ctx.closings : [];
const endWithClosing = text => {
  if (ctx.channel === 'whatsapp' || !closings.length) return text;
  const bare = s => norm(s).replace(/[,،.;:\s]+$/g, '');
  const lines = text.split('\n');
  const trim = () => { while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); };
  trim();
  const last = lines[lines.length - 1] || '';
  if (closings.some(c => bare(c) === bare(last))) return lines.join('\n');
  const nameLine = ctx.lang === 'ar' ? words(last) <= 3 && !/[?؟.!]$/.test(last) : ctx.senderName && norm(last).includes(norm(ctx.senderName)) && words(last) <= 5;
  if (nameLine) { lines.pop(); trim(); }
  return lines.join('\n') + '\n\n' + closings[0];
};
// The last guard for the subject: no emojis or symbols, and no more words than the limit.
const cleanSubject = t => {
  const parts = String(t || '').replace(/[\p{Extended_Pictographic}\p{So}\p{Sk}\u200d\ufe0f]/gu, ' ').replace(/[&\/|:;#@*<>{}\[\]\\"]/g, ' ').replace(/!+/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const max = ctx.limits && ctx.limits.subjectWords ? ctx.limits.subjectWords : 8;
  return parts.slice(0, max).join(' ').replace(/[,;:\s]+$/g, '');
};
const out = {
  subject: ctx.channel === 'whatsapp' ? '' : cleanSubject(plainText(chosen.subject)),
  body: endWithClosing(plainText(chosen.body)),
  // what was read on the sender's own links this time, for the backend to keep (null when nothing was read)
  linksKnowledge: ctx.knowledgeNew,
  linksHash: ctx.linksHash,
  // which version of the prompt files wrote this message
  promptVersion: ctx.promptVersion,
  meter,
};
// For the evaluation script only: how the message came about. The backend never asks for it.
if ((($('Webhook').first().json.body) || {}).debug === true) {
  out.debug = { attempts: check.retryPrompt ? 2 : 1, modelIndex: found.index, firstProblems: check.problems || [], finalProblems: lint(chosen, ctx), angle: chosen.angle, firstBody: first ? first.body : null };
}
return [{ json: out }];
