// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
//
// Παράγει τον φάκελο dist/, που ανεβαίνει αυτούσιος στον server:
//   index.html            η εφαρμογή, αυτοτελής (κώδικας, στυλ, γραμματοσειρές ενσωματωμένα)
//   site.webmanifest      εγκατάσταση ως εφαρμογή
//   *.png                 εικονίδια και εικόνα κοινοποίησης (από το docs/brand)
// Χρήση: npm run build (συμπιεσμένο) ή npm run build:dev
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { iconSvg } from './src/ui/brand-mark.js';
import { BRAND } from './src/brand.js';
import { renderHead, renderNoscript, renderManifest } from './tools/build/seo.mjs';

const ASSETS = ['social-preview.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

const ROOT = new URL('./', import.meta.url);
const SRC = new URL('./src/', import.meta.url);
const DIST = new URL('./dist/', import.meta.url);

const pkg = JSON.parse(await readFile(new URL('package.json', ROOT), 'utf8'));
const notice = [
  `${pkg.productName} ${pkg.version}: ${pkg.description}`,
  `Copyright (c) 2026 ${pkg.author.name}`,
  `Άδεια ${pkg.license}. Πηγαίος κώδικας: ${pkg.homepage}`,
].join('\n');

const template = await readFile(new URL('index.html', SRC), 'utf8');

const cssFiles = [...template.matchAll(/<link rel="stylesheet" href="(styles\/[^"]+)">/g)].map((m) => m[1]);
const rawCss = (await Promise.all(cssFiles.map((f) => readFile(new URL(f, SRC), 'utf8')))).join('\n');

// Οι γραμματοσειρές ενσωματώνονται ως data URI, ώστε το αρχείο να μην κάνει καμία εξωτερική κλήση.
const fontUrls = [...new Set([...rawCss.matchAll(/url\(\.\.\/fonts\/([^)]+)\)/g)].map((m) => m[1]))];
const fonts = Object.fromEntries(await Promise.all(fontUrls.map(async (name) => {
  const data = await readFile(new URL(`fonts/${name}`, SRC));
  return [name, `data:font/woff2;base64,${data.toString('base64')}`];
})));
const css = rawCss.replace(/url\(\.\.\/fonts\/([^)]+)\)/g, (_, name) => `url(${fonts[name]})`);

const result = await build({
  entryPoints: [new URL('main.js', SRC).pathname],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: process.argv.includes('--minify'),
  legalComments: 'none',
  banner: { js: `/*!\n${notice}\n*/` },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  write: false,
  charset: 'utf8',
});
// Ασφαλής ενσωμάτωση σε <script>: κανένα κλείσιμο ετικέτας και κανένας χαρακτήρας
// αντικατάστασης (U+FFFD) αυτούσιος, που ορισμένοι έλεγχοι εγκυρότητας θεωρούν σφάλμα κωδικοποίησης.
const js = result.outputFiles[0].text
  .replace(/<\/script/gi, '<\\/script')
  .replace(/\uFFFD/g, '\\uFFFD');

const html = template
  .replace(/^<!doctype html>\n<!-- SPDX[^\n]*-->/, `<!doctype html>\n<!--\nSPDX-License-Identifier: MIT\n${notice}\n-->`)
  .replace(/ *<!-- build:seo[\s\S]*?<!-- endbuild -->/, () => renderHead({ ...BRAND, version: pkg.version }, iconSvg('fav')))
  .replace(/<!-- build:noscript -->[\s\S]*?<!-- endbuild -->/, () => renderNoscript(BRAND))
  .replace(/<!-- build:css -->[\s\S]*?<!-- endbuild -->/, () => `<style>\n${css}\n</style>`)
  .replace(/<!-- build:js -->[\s\S]*?<!-- endbuild -->/, () => `<script>\n${js}\n</script>`);

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await writeFile(new URL('index.html', DIST), html);
await writeFile(new URL('site.webmanifest', DIST), renderManifest(BRAND));
await Promise.all(ASSETS.map((f) => copyFile(new URL(`docs/brand/${f}`, ROOT), new URL(f, DIST))));
console.log(`dist/index.html: ${(html.length / 1024).toFixed(1)} KB, και ${ASSETS.length + 1} συνοδευτικά αρχεία`);
