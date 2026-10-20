// The first answer from the AI: read it and check it. When it breaks rules, prepare one second try that names them.
const ctx = $('Build Prompt').first().json;
const found = firstAnswer();
const first = found.answer || parseAi($input.first().json);
const problems = lint(first, ctx);

let retryPrompt = null;
// when no model answered at all, a second try would only wait again
if (problems.length && (first || found.replied)) {
  retryPrompt = ctx.prompt
    + (first ? '\n\nYour previous answer:\n' + JSON.stringify(first) : '\n\nYour previous answer could not be read.')
    + '\n\nIt broke these rules:\n- ' + problems.join('\n- ')
    + '\n\nWrite the message again and fix every one of them. Reply with the same JSON only.';
}
// modelIndex: which attempt answered, so the second try asks the same model
return [{ json: { retryPrompt, problems, modelIndex: found.index } }];
