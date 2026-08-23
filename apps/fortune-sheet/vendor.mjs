/*
 * vendor.mjs — rebuild vendor/fortune-sheet.js from the pinned npm packages.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/fortune-sheet/vendor.mjs
 *
 * WHAT IT PRODUCES. One classic IIFE exposing `window.FortuneSheet` —
 * { React, createRoot, Workbook } — plus the engine CSS and the MIT notices.
 * GifOS inlines <script src> by rewriting the tag and DROPS type="module", so
 * the upstream ESM tree cannot ride into an app as-is.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const REACT = '18.3.1';
const FORTUNE = '1.0.4';
const ESBUILD = '0.25.9';

const tmp = mkdtempSync(join(tmpdir(), 'fortune-sheet-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 300000 });

console.log('installing @fortune-sheet/react@' + FORTUNE + ' + react@' + REACT + ' in ' + tmp);
run('npm', ['init', '-y'], tmp);
run('npm', ['install', '--omit=dev',
  '@fortune-sheet/react@' + FORTUNE,
  'react@' + REACT,
  'react-dom@' + REACT,
  'esbuild@' + ESBUILD,
], tmp);

// PATCHES WE CARRY, applied to the published package BEFORE the bundle.
//
// The sandbox CSP is script-src 'unsafe-inline' with no 'unsafe-eval', so
// `new Function` throws EvalError inside the app. Upstream uses it in
// insertRowCol to splice a batch of empty rows into the dense matrix
// (`return d.unshift(${jsonRows})`). That is just Array.splice; rewrite it
// so insert-row works offline, and FAIL THE BUILD if the site moves.
const coreDir = join(tmp, 'node_modules', '@fortune-sheet', 'core');
// Literal replacements against the compiled dist. tsc keeps the source names
// (arr, index, d). FAIL THE BUILD if any of these strings have moved.
const PATCHES = [
  {
    find: 'new Function("d", "return d.unshift(".concat(arr.join(","), ")"))(d)',
    replace: 'd.unshift.apply(d, arr.map(JSON.parse))',
    why: 'insert rows at 0 without new Function (CSP forbids eval)',
  },
  {
    find: 'new Function("d", "return d.splice(".concat(index, ", 0, ").concat(arr.join(","), ")"))(d)',
    replace: 'd.splice.apply(d, [index, 0].concat(arr.map(JSON.parse)))',
    why: 'insert rows without new Function (CSP forbids eval)',
  },
  {
    find: 'new Function("d", "return d.splice(".concat(index + 1, ", 0, ").concat(arr.join(","), ")"))(d)',
    replace: 'd.splice.apply(d, [index + 1, 0].concat(arr.map(JSON.parse)))',
    why: 'insert rows below without new Function (CSP forbids eval)',
  },
];

function patchTree(root) {
  const stack = [root];
  const hits = new Array(PATCHES.length).fill(0);
  while (stack.length) {
    const here = stack.pop();
    for (const name of readdirSync(here)) {
      const p = join(here, name);
      const st = statSync(p);
      if (st.isDirectory()) { stack.push(p); continue; }
      if (!/\.(js|mjs|cjs)$/.test(name)) continue;
      let src = readFileSync(p, 'utf8');
      let changed = false;
      PATCHES.forEach((pat, i) => {
        if (!src.includes(pat.find)) return;
        src = src.split(pat.find).join(pat.replace);
        hits[i]++;
        changed = true;
        console.log('patched ' + p.slice(root.length + 1) + ' — ' + pat.why);
      });
      if (changed) writeFileSync(p, src);
    }
  }
  return hits;
}

const patchHits = patchTree(coreDir);
if (patchHits.some((n) => n < 1)) {
  throw new Error('PATCH NO LONGER APPLIES: insertRowCol new Function rewrite(s) missing in @fortune-sheet/core (hits ' +
    patchHits.join(',') + ') — upstream moved the code. Re-target the patch or drop it DELIBERATELY.');
}

// Same three sites, walked in the minified IIFE. Names after esbuild are not
// `arr`/`d`; match the concat shape and refuse if a site does not parse.
function rewriteInsertRowEval(src) {
  const prefix = 'new Function("d","return d.';
  let js = src;
  let from = 0;
  let n = 0;
  while (true) {
    const at = js.indexOf(prefix, from);
    if (at < 0) break;
    const rest = js.slice(at + prefix.length);
    let replacement = null;
    let consumed = 0;
    if (rest.startsWith('unshift(".concat(')) {
      const inner = rest.slice('unshift(".concat('.length);
      const joinAt = inner.indexOf('.join(",")');
      if (joinAt < 0) throw new Error('unshift join(",") missing after new Function');
      const arr = inner.slice(0, joinAt);
      if (!/^\w+$/.test(arr)) throw new Error('unshift arr is not an ident: ' + arr);
      const after = inner.slice(joinAt + '.join(",")'.length);
      const m = after.match(/^,"\)"\)\)\((\w+)\)/);
      if (!m) throw new Error('unshift apply form moved: ' + after.slice(0, 60));
      replacement = m[1] + '.unshift.apply(' + m[1] + ', ' + arr + '.map(JSON.parse))';
      consumed = prefix.length + 'unshift(".concat('.length + joinAt + '.join(",")'.length + m[0].length;
    } else if (rest.startsWith('splice(".concat(')) {
      const inner = rest.slice('splice(".concat('.length);
      let i = 0;
      while (i < inner.length && /[A-Za-z0-9_$]/.test(inner[i])) i++;
      const index = inner.slice(0, i);
      if (!index) throw new Error('splice index missing: ' + inner.slice(0, 60));
      let plusOne = false;
      if (inner.startsWith('+1', i)) { plusOne = true; i += 2; }
      const mid = ',", 0, ").concat(';
      if (!inner.startsWith(mid, i)) throw new Error('splice mid form moved: ' + inner.slice(0, 80));
      i += mid.length;
      const joinAt = inner.indexOf('.join(",")', i);
      if (joinAt < 0) throw new Error('splice join(",") missing after new Function');
      const arr = inner.slice(i, joinAt);
      if (!/^\w+$/.test(arr)) throw new Error('splice arr is not an ident: ' + arr);
      const after = inner.slice(joinAt + '.join(",")'.length);
      const m = after.match(/^,"\)"\)\)\((\w+)\)/);
      if (!m) throw new Error('splice apply form moved: ' + after.slice(0, 60));
      const idx = plusOne ? index + ' + 1' : index;
      replacement = m[1] + '.splice.apply(' + m[1] + ', [' + idx + ', 0].concat(' + arr + '.map(JSON.parse)))';
      consumed = prefix.length + 'splice(".concat('.length + joinAt + '.join(",")'.length + m[0].length;
    } else {
      throw new Error('new Function insert-row helper is no longer unshift/splice: ' + rest.slice(0, 80));
    }
    js = js.slice(0, at) + replacement + js.slice(at + consumed);
    from = at + replacement.length;
    n++;
  }
  if (n && n !== 3) {
    throw new Error('expected 3 insert-row new Function sites, rewrote ' + n);
  }
  return js;
}

const facade = join(tmp, 'gifos-facade.js');
writeFileSync(facade, [
  "import React from 'react';",
  "import { createRoot } from 'react-dom/client';",
  "import { Workbook } from '@fortune-sheet/react';",
  'export { React, createRoot, Workbook };',
  '',
].join('\n'));

const outJs = join(tmp, 'fortune-sheet.js');
const esbuild = join(tmp, 'node_modules', '.bin', 'esbuild');
run(esbuild, [
  facade,
  '--bundle',
  '--format=iife',
  '--global-name=FortuneSheet',
  '--platform=browser',
  '--target=es2018',
  '--minify',
  '--legal-comments=none',
  '--outfile=' + outJs,
], tmp);

let js = readFileSync(outJs, 'utf8');
if (/<\/script/i.test(js)) {
  js = js.split('</').join('<\\/');
}
if (/^\s*export\s|export\{|import\.meta/m.test(js)) {
  throw new Error('bundle still has ESM syntax — the classic-script inline path cannot carry it');
}

// Minify can rename `arr`/`d` after the source patch, or a dist file we did
// not walk can still carry the helper. Rewrite the three insert-row sites in
// the finished IIFE too, then refuse to ship if any `new Function` remains.
js = rewriteInsertRowEval(js);
if (/\bnew Function\b/.test(js)) {
  throw new Error('bundle still contains new Function — the sandbox CSP will throw EvalError on insert-row');
}

const cssSrc = join(tmp, 'node_modules', '@fortune-sheet', 'react', 'dist', 'index.css');
let css = readFileSync(cssSrc, 'utf8');
if (/url\(\s*['"]?https?:/i.test(css)) {
  throw new Error('fortune-sheet CSS fetches a remote url() — that will fail under connect-src none');
}

mkdirSync(join(dir, 'vendor'), { recursive: true });
writeFileSync(join(dir, 'vendor', 'fortune-sheet.js'), js);
writeFileSync(join(dir, 'vendor', 'fortune-sheet.css'), css);

// The published @fortune-sheet/react tarball is dist/ only — no LICENSE file.
// The text is the project's MIT notice (Copyright 2022 Suzhou Ruilisi…).
writeFileSync(join(dir, 'vendor', 'COPYING-fortune-sheet.txt'),
  'MIT License\n\n' +
  'Copyright (c) 2022 Suzhou Ruilisi Technology Co., Ltd\n\n' +
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
copyFileSync(join(tmp, 'node_modules', 'react', 'LICENSE'), join(dir, 'vendor', 'COPYING-react.txt'));

const corePkg = JSON.parse(readFileSync(join(tmp, 'node_modules', '@fortune-sheet', 'core', 'package.json'), 'utf8'));
const reactPkg = JSON.parse(readFileSync(join(tmp, 'node_modules', 'react', 'package.json'), 'utf8'));
writeFileSync(join(dir, 'vendor', 'UPSTREAM.txt'),
  'vendor/fortune-sheet.js and vendor/fortune-sheet.css are GENERATED.\n' +
  'Do not edit them; run node apps/fortune-sheet/vendor.mjs.\n\n' +
  'upstream: https://github.com/ruilisi/fortune-sheet\n' +
  'npm:      @fortune-sheet/react@' + FORTUNE + '\n' +
  'core:     @fortune-sheet/core@' + corePkg.version + '\n' +
  'react:    ' + reactPkg.version + '\n' +
  'entry:    gifos-facade.js (written by vendor.mjs), IIFE, global FortuneSheet\n' +
  '          exposing { React, createRoot, Workbook }\n\n' +
  'Their collab backend (onOp → Express/Mongo) is NOT bundled and is never\n' +
  'called. Licences ride beside the bundle and inside the GIF:\n' +
  'COPYING-fortune-sheet.txt, COPYING-react.txt.\n');

const bytes = Buffer.byteLength(js);
console.log('wrote apps/fortune-sheet/vendor/fortune-sheet.js — ' +
  (bytes / 1024).toFixed(0) + ' KB, css ' +
  (Buffer.byteLength(css) / 1024).toFixed(0) + ' KB');

rmSync(tmp, { recursive: true, force: true });
