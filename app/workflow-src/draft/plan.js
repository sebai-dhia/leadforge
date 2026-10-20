// Which pages to read before writing: the business's own website, and the sender's own links
// when nothing is cached for them. Social networks are skipped: they only show a login page to a program.
const b = $json.body || {};
const SOCIAL = /(facebook|instagram|linkedin|twitter|tiktok|youtube|whatsapp|linktr|wa\.me)/i;
const readable = u => { const p = parseUrl(u); return p && !SOCIAL.test(p.hostname); };

const items = [];
const site = safeUrl(b.website);
if (site && readable(site)) items.push({ json: { kind: 'business', url: site } });
if (!b.linksKnowledge) {
  for (const l of (Array.isArray(b.links) ? b.links : []).slice(0, 3)) {
    const u = safeUrl(l && l.url);
    if (u && readable(u)) items.push({ json: { kind: 'sender', url: u, label: String((l && l.label) || '').slice(0, 30) } });
  }
}
return items.length ? items : [{ json: { kind: 'none', url: null } }];
