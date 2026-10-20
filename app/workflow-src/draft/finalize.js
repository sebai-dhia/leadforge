// Picks the answer to send back: the first one when it was fine, otherwise the second try if it is better.
const ctx = $('Build Prompt').first().json;
const check = $('Check').first().json;
const first = parseAi($('AI Write Message').first().json);
const retry = check.retryPrompt ? parseAi($input.first().json) : null;

let chosen = first;
if (check.retryPrompt) {
  const second = lint(retry, ctx);
  const firstProblems = lint(first, ctx);
  if (retry && (!first || second.length <= firstProblems.length)) chosen = retry;
}
if (!chosen) return [{ json: { error: true, message: 'The AI did not return a usable message' } }];

return [{ json: {
  subject: ctx.channel === 'whatsapp' ? '' : chosen.subject,
  body: chosen.body,
  // what was read on the sender's own links this time, for the backend to keep (null when nothing was read)
  linksKnowledge: ctx.knowledgeNew,
  linksHash: ctx.linksHash,
} }];
