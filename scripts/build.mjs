import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { safeContact } from '../server.js';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL('public/', root), dist, { recursive: true });
for (const name of ['demo', 'terms']) {
  await mkdir(new URL(`${name}/`, dist), { recursive: true });
  await cp(new URL(`public/${name}.html`, root), new URL(`${name}/index.html`, dist));
}
const config = JSON.parse(await readFile(new URL('site.config.json', root), 'utf8'));
await writeFile(new URL('config.json', dist), JSON.stringify({ contactUrl: safeContact(process.env.CONTACT_URL ?? config.contactUrl) }, null, 2));
await writeFile(new URL('_headers', dist), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
`);
console.log('Static site built in dist/');
