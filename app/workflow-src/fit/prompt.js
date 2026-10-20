// One AI call per search: the best leads, the freelancer's offer and only facts we collected.
// The text, the wording of each lead line and the limits live in prompts/fit/ (PROMPTS, with render(), is put in front of this code).
const body = $('Webhook').first().json.body || {};
const leads = $input.all().map(i => i.json);
const picks = leads.map((l, i) => [l, i]).filter(([l]) => l && l.aiCheck);
if (!picks.length) return [{ json: { prompt: null, idx: [] } }];

const LIM = PROMPTS.data.config.limits;
const LEAD = PROMPTS.data.lead;
const W = LEAD.words;
const clean = (t, n = LIM.text) => String(t || '').replace(/[\r\n]+/g, ' ').replace(/[<>{}\[\]]/g, ' ').slice(0, n);
const host = u => String(u || '').replace(/^https?:\/\//, '').split('/')[0];

const lines = picks.map(([l], k) => {
  const vars = {
    n: k + 1,
    name: clean(l.name).slice(0, LIM.name),
    type: clean(l.niche).slice(0, LIM.niche),
    reviews: (l.reviews || 0) + (l.rating ? render(W.ratingSuffix, { rating: l.rating }) : ''),
    website: l.website ? host(l.website) : W.noWebsite,
    contact: [l.phone ? W.phone : '', (l.emails || []).length ? W.email : '', (l.social || []).length ? W.social : ''].filter(Boolean).join(', '),
    checks: clean(l.reason).slice(0, LIM.checks),
    siteText: l.siteText ? render(W.quoted, { value: clean(l.siteText) }) : W.noSiteText,
  };
  return LEAD.parts.map(part => render(part, vars)).join(LEAD.separator);
});

const prompt = render(PROMPTS.templates.prompt, { service: clean(body.service).slice(0, LIM.service), leads: lines.join('\n') });
return [{ json: { prompt, idx: picks.map(([, i]) => i), promptVersion: PROMPTS.version } }];
