/*
 * vendor.mjs — rebuild vendor/excalidraw.js from the pinned npm packages.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/excalidraw/vendor.mjs
 *
 * WHAT IT PRODUCES. One classic IIFE exposing `window.ExcalidrawLib` —
 * { React, createRoot, Excalidraw, MainMenu, serializeAsJSON, … } — plus the
 * engine CSS (fonts inlined as data: URLs) and the MIT notices.
 * GifOS inlines <script src> by rewriting the tag and DROPS type="module", so
 * the upstream ESM tree cannot ride into an app as-is.
 *
 * Fonts are inlined so font-src data: is enough; the esm.run CDN is never
 * contacted. Their collab/Firebase code is not in this package.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const REACT = '18.3.1';
const EXCALIDRAW = '0.18.1';
const ESBUILD = '0.25.9';

const tmp = mkdtempSync(join(tmpdir(), 'excalidraw-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 300000 });

console.log('installing @excalidraw/excalidraw@' + EXCALIDRAW + ' + react@' + REACT + ' in ' + tmp);
run('npm', ['init', '-y'], tmp);
run('npm', ['install', '--omit=dev',
  '@excalidraw/excalidraw@' + EXCALIDRAW,
  'react@' + REACT,
  'react-dom@' + REACT,
  'esbuild@' + ESBUILD,
], tmp);

const pkgRoot = join(tmp, 'node_modules', '@excalidraw', 'excalidraw');
const fontsDir = join(pkgRoot, 'dist', 'prod', 'fonts');

// Walk the shipped font files so the UPSTREAM pin records what we inlined.
function listFonts(root) {
  if (!existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const here = stack.pop();
    for (const name of readdirSync(here)) {
      const p = join(here, name);
      const st = statSync(p);
      if (st.isDirectory()) { stack.push(p); continue; }
      if (/\.(woff2?|ttf|otf)$/i.test(name)) out.push({ rel: p.slice(root.length + 1), bytes: st.size });
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}
const fonts = listFonts(fontsDir);
let fontBytes = 0;
for (const f of fonts) {
  fontBytes += f.bytes;
  console.log('  font ' + f.rel + '  ' + (f.bytes / 1024).toFixed(1) + ' KB');
}
console.log('fonts total ' + (fontBytes / 1024).toFixed(0) + ' KB in ' + fonts.length + ' files');

const facade = join(tmp, 'gifos-facade.js');
writeFileSync(facade, [
  "import React from 'react';",
  "import { createRoot } from 'react-dom/client';",
  "import {",
  "  Excalidraw,",
  "  MainMenu,",
  "  WelcomeScreen,",
  "  serializeAsJSON,",
  "  loadFromBlob,",
  "  exportToBlob,",
  "  exportToSvg,",
  "  restoreElements,",
  "} from '@excalidraw/excalidraw';",
  "export {",
  "  React, createRoot,",
  "  Excalidraw, MainMenu, WelcomeScreen,",
  "  serializeAsJSON, loadFromBlob, exportToBlob, exportToSvg,",
  "  restoreElements,",
  "};",
  '',
].join('\n'));

const outJs = join(tmp, 'excalidraw.js');
const esbuild = join(tmp, 'node_modules', '.bin', 'esbuild');
run(esbuild, [
  facade,
  '--bundle',
  '--format=iife',
  '--global-name=ExcalidrawLib',
  '--platform=browser',
  '--target=es2018',
  '--minify',
  '--legal-comments=none',
  '--loader:.woff2=dataurl',
  '--loader:.woff=dataurl',
  '--loader:.ttf=dataurl',
  '--loader:.otf=dataurl',
  '--loader:.eot=dataurl',
  '--asset-names=[name]',
  '--define:process.env.NODE_ENV="production"',
  '--define:process.env.IS_PREACT=false',
  '--outfile=' + outJs,
], tmp);

let js = readFileSync(outJs, 'utf8');
if (/<\/script/i.test(js)) {
  js = js.split('</').join('<\\/');
}

// Neutralise the esm.sh / esm.run font CDN fallback. Fonts are data: URLs in
// this bundle; if a code path still concatenates ASSET_PATH, a remote fetch
// would hit connect-src none and spam the console.
const CDN_RE = /https:\/\/esm\.(?:sh|run)\/[^"'`\s)]+/g;
const UNPKG_RE = /https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net)\/[^"'`\s)]+/g;
const cdnHits = (js.match(CDN_RE) || []).length + (js.match(UNPKG_RE) || []).length;
if (cdnHits) {
  js = js.replace(CDN_RE, 'data:,').replace(UNPKG_RE, 'data:,');
  console.log('rewrote ' + cdnHits + ' CDN font/asset URL(s) to data:,');
}

// Fonts are string URIs (`./fonts/Excalifont/….woff2`), not ESM imports, so
// esbuild's woff2 loader never sees them. Inline the Latin faces as data:
// URLs (font-src is data: only). Skip Xiaolai — 200+ CJK slices, ~12 MB —
// and let CJK fall back to the system font.
const LATIN = new Set(['Assistant', 'Cascadia', 'ComicShanns', 'Excalifont', 'Liberation', 'Lilita', 'Nunito', 'Virgil']);
function fontDataUrl(abs) {
  return 'data:font/woff2;base64,' + readFileSync(abs).toString('base64');
}
const FONT_PATH = /(\.?\/)?fonts\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+\.woff2)/g;
function inlineFontPaths(text, label) {
  let nIn = 0, nSkip = 0, bytesIn = 0;
  const out = text.replace(FONT_PATH, (m, _pre, fam, file) => {
    if (!LATIN.has(fam)) { nSkip++; return 'data:,'; }
    const abs = join(fontsDir, fam, file);
    if (!existsSync(abs)) throw new Error('missing font ' + fam + '/' + file + ' while inlining ' + label);
    nIn++;
    bytesIn += statSync(abs).size;
    return fontDataUrl(abs);
  });
  console.log('inlined ' + nIn + ' ' + label + ' font(s) (' + (bytesIn / 1024).toFixed(0) + ' KB), skipped ' + nSkip);
  return out;
}
js = inlineFontPaths(js, 'js');
if (/fonts\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.woff2/.test(js)) {
  throw new Error('js still has relative fonts/ paths after inlining');
}

if (/^\s*export\s|export\{|import\.meta/m.test(js)) {
  throw new Error('bundle still has ESM syntax — the classic-script inline path cannot carry it');
}

const cssSrc = join(pkgRoot, 'dist', 'prod', 'index.css');
let css = readFileSync(cssSrc, 'utf8');
css = inlineFontPaths(css, 'css');
if (/url\(\s*['"]?https?:/i.test(css)) {
  throw new Error('excalidraw CSS fetches a remote url() — that will fail under connect-src none');
}
if (/fonts\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.woff2/.test(css)) {
  throw new Error('css still has relative fonts/ paths after inlining');
}

mkdirSync(join(dir, 'vendor'), { recursive: true });
writeFileSync(join(dir, 'vendor', 'excalidraw.js'), js);
writeFileSync(join(dir, 'vendor', 'excalidraw.css'), css);

const licenseSrc = [
  join(pkgRoot, 'LICENSE'),
  join(pkgRoot, 'LICENSE.md'),
  join(tmp, 'node_modules', '@excalidraw', 'excalidraw', 'LICENSE'),
].find((p) => existsSync(p));
if (licenseSrc) copyFileSync(licenseSrc, join(dir, 'vendor', 'COPYING-excalidraw.txt'));
else {
  writeFileSync(join(dir, 'vendor', 'COPYING-excalidraw.txt'),
    'MIT License\n\n' +
    'Copyright (c) 2020 Excalidraw\n\n' +
    'Permission is hereby granted, free of charge, to any person obtaining a copy\n' +
    'of this software and associated documentation files (the "Software"), to deal\n' +
    'in the Software without restriction, including without limitation the rights\n' +
    'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n' +
    'copies of the Software, and to permit persons to whom the Software is\n' +
    'furnished to do so, subject to the following conditions:\n\n' +
    'The above copyright notice and this permission notice shall be included in all\n' +
    'copies or substantial portions of the Software.\n\n' +
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n' +
    'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n' +
    'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n' +
    'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n' +
    'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n' +
    'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n' +
    'SOFTWARE.\n');
}
copyFileSync(join(tmp, 'node_modules', 'react', 'LICENSE'), join(dir, 'vendor', 'COPYING-react.txt'));

writeFileSync(join(dir, 'vendor', 'UPSTREAM.txt'),
  'vendor/excalidraw.js and vendor/excalidraw.css are GENERATED.\n' +
  'Do not edit them; run node apps/excalidraw/vendor.mjs.\n\n' +
  'upstream: https://github.com/excalidraw/excalidraw\n' +
  'npm:      @excalidraw/excalidraw@' + EXCALIDRAW + '\n' +
  'react:    ' + REACT + '\n' +
  'entry:    gifos-facade.js (written by vendor.mjs), IIFE, global ExcalidrawLib\n' +
  '          exposing { React, createRoot, Excalidraw, MainMenu, serializeAsJSON, … }\n' +
  'fonts:    Latin faces inlined as data: URLs from dist/prod/fonts.\n' +
  '          Xiaolai (CJK, ~12 MB) is omitted; CJK falls back to the system font.\n\n' +
  'Firebase / live-collab is NOT in this package and is never called.\n' +
  'The public library CDN (libraries.excalidraw.com) is not fetched.\n' +
  'Licences ride beside the bundle and inside the GIF:\n' +
  'COPYING-excalidraw.txt, COPYING-react.txt.\n');

const bytes = Buffer.byteLength(js);
console.log('wrote apps/excalidraw/vendor/excalidraw.js — ' +
  (bytes / 1024).toFixed(0) + ' KB, css ' +
  (Buffer.byteLength(css) / 1024).toFixed(0) + ' KB');

rmSync(tmp, { recursive: true, force: true });
