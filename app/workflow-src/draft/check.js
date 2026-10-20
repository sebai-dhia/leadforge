// The first answer from the AI: read it and check it. When it breaks rules, prepare one second try that names them.
const ctx = $('Build Prompt').first().json;
const first = parseAi($input.first().json);
const problems = lint(first, ctx);

let retryPrompt = null;
if (problems.length) {
  retryPrompt = ctx.prompt
    + (first ? '\n\nYour previous answer:\n' + JSON.stringify(first) : '\n\nYour previous answer could not be read.')
    + '\n\nIt broke these rules:\n- ' + problems.join('\n- ')
    + '\n\nWrite the message again and fix every one of them. Reply with the same JSON only.';
}
return [{ json: { retryPrompt, problems } }];
