// Picks the answer to send back: the first one when it was fine, otherwise the second try if it is better.
const ctx = $('Build Prompt').first().json;
const check = $('Check').first().json;
const found = firstAnswer();
const first = found.answer || parseAi($('AI Write Message').first().json);
const retry = check.retryPrompt ? parseAi($input.first().json) : null;

let chosen = first;
if (check.retryPrompt) {
  const second = lint(retry, ctx);
  const firstProblems = lint(first, ctx);
  if (retry && (!first || second.length <= firstProblems.length)) chosen = retry;
}
if (!chosen) return [{ json: { error: true, message: 'The AI did not return a usable message' } }];

// the last guard: dashes used as punctuation become commas, underscores become spaces
const withoutArabic = t => (ctx.lang === 'ar' ? t : t.replace(/[-–—|:]?[ \t]*[؀-ۿݐ-ݿ][؀-ۿݐ-ݿ \t.,،()]*/g, ' ').replace(/ {2,}/g, ' ').replace(/ ([.,])/g, '$1'));
const plainText = t => withoutArabic(String(t || '')).replace(/\s+[—–-]\s+/g, ', ').replace(/[—–]/g, ', ').replace(/_/g, ' ').replace(/,\s*,/g, ',');
const out = {
  subject: ctx.channel === 'whatsapp' ? '' : plainText(chosen.subject),
  body: plainText(chosen.body),
  // what was read on the sender's own links this time, for the backend to keep (null when nothing was read)
  linksKnowledge: ctx.knowledgeNew,
  linksHash: ctx.linksHash,
  // which version of the prompt files wrote this message
  promptVersion: ctx.promptVersion,
};
// For the evaluation script only: how the message came about. The backend never asks for it.
if ((($('Webhook').first().json.body) || {}).debug === true) {
  out.debug = { attempts: check.retryPrompt ? 2 : 1, modelIndex: found.index, firstProblems: check.problems || [], finalProblems: lint(chosen, ctx), angle: chosen.angle, firstBody: first ? first.body : null };
}
return [{ json: out }];
