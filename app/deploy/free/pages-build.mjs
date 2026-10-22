// Prepares the built web app for Cloudflare Pages, where it is hosted apart from the API (deploy/free/README.md).
// Run from app/frontend after `ng build`:  LEADFORGE_API_URL=https://<backend>.onrender.com/api node ../deploy/free/pages-build.mjs
// It writes the API's address into index.html and the security headers Caddy sets on a server into _headers,
// with the API's origin added to connect-src. The headers are read from frontend/Caddyfile, so both stay the same.
import { readFileSync, writeFileSync } from 'node:fs';

const api = (process.env.LEADFORGE_API_URL ?? '').replace(/\/+$/, '');
if (!/^https:\/\/[^/]+\/api$/.test(api)) {
  console.error('Set LEADFORGE_API_URL to the backend address ending in /api, for example https://leadforge-api.onrender.com/api');
  process.exit(1);
}
const out = 'dist/frontend/browser';

const index = `${out}/index.html`;
const html = readFileSync(index, 'utf8');
if (!html.includes('%LEADFORGE_API%')) {
  console.error(`${index} has no %LEADFORGE_API% placeholder`);
  process.exit(1);
}
writeFileSync(index, html.replace('%LEADFORGE_API%', api));

// every header line of the Caddyfile's header block, for example: X-Frame-Options DENY
const caddy = readFileSync('Caddyfile', 'utf8');
const block = caddy.match(/\n\theader \{\n([\s\S]*?)\n\t\}/)?.[1];
if (!block) {
  console.error('No header block found in Caddyfile');
  process.exit(1);
}
const headers = block.split('\n')
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#') && !line.startsWith('-'))
  .map(line => {
    const [, name, value] = line.match(/^(\S+)\s+"?(.*?)"?$/);
    const v = name === 'Content-Security-Policy'
      ? value.replace("connect-src 'self'", `connect-src 'self' ${new URL(api).origin}`)
      : value;
    return `  ${name}: ${v}`;
  });
writeFileSync(`${out}/_headers`, `/*\n${headers.join('\n')}\n`);

console.log(`API ${api}; ${headers.length} security headers written to ${out}/_headers`);
