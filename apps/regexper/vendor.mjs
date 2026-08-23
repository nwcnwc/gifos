/*
 * vendor.mjs — rebuild vendor/regexper.js from the pinned upstream.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/regexper/vendor.mjs
 *   REGEXPER_SRC=/path/to/checkout node apps/regexper/vendor.mjs
 *
 * WHAT IT PRODUCES. One classic IIFE: javallone's parser + railroad renderer,
 * plus lodash and Snap.svg (via snapsvg-cjs). GifOS inlines <script src> and
 * DROPS type="module", so the ES6 tree cannot ride as-is. canopy compiles the
 * PEG grammar; esbuild emits the IIFE. No babel-polyfill, no Google font, no
 * analytics, no CDN.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dir = dirname(fileURLToPath(import.meta.url));
const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });

const UPSTREAM = 'https://github.com/javallone/regexper-static.git';
const PIN = '126d29588d30b2beac6ce684c575b0c5dda1b006'; // master, 2018-06-06 "Update README to indicate project migration"

const DEPS = {
  esbuild: '0.21.5',
  lodash: '4.17.21',
  'snapsvg-cjs': '0.0.6',
  canopy: '0.2.0',
};

const run = (cmd, args, cwd, opts = {}) => execFileSync(cmd, args, {
  cwd, stdio: opts.stdio || 'inherit', timeout: opts.timeout || 900000,
  encoding: opts.encoding,
  env: { ...process.env, HUSKY: '0', ...(opts.env || {}) },
});

let src = process.env.REGEXPER_SRC;
let tmp = mkdtempSync(join(tmpdir(), 'regexper-'));
if (!src) {
  src = join(tmp, 'regexper-static');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');

const jsDir = join(src, 'src', 'js');
if (!existsSync(join(jsDir, 'main.js'))) throw new Error('upstream has no src/js/main.js');
if (!existsSync(join(jsDir, 'parser', 'javascript', 'grammar.peg'))) {
  throw new Error('upstream has no grammar.peg');
}

const work = join(tmp, 'build');
mkdirSync(work, { recursive: true });
run('cp', ['-a', jsDir, join(work, 'src')]);
writeFileSync(join(work, 'package.json'), JSON.stringify({
  name: 'regexper-vendor-build',
  private: true,
  type: 'commonjs',
}, null, 2) + '\n');

const npmArgs = ['install', '--no-save', '--no-audit', '--no-fund'];
for (const [n, v] of Object.entries(DEPS)) npmArgs.push(n + '@' + v);
console.log('npm ' + npmArgs.join(' ') + ' …');
run('npm', npmArgs, work);

writeFileSync(join(work, 'snap-inject.js'), "export { default as Snap } from 'snapsvg-cjs';\n");
writeFileSync(join(work, 'bundle.mjs'), `import * as esbuild from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const canopy = require('canopy');

await esbuild.build({
  absWorkingDir: process.cwd(),
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2018',
  minify: true,
  inject: ['./snap-inject.js'],
  alias: { snapsvg: 'snapsvg-cjs' },
  outfile: 'regexper.js',
  logLevel: 'info',
  plugins: [{
    name: 'canopy-peg',
    setup(build) {
      build.onLoad({ filter: /\\.peg$/ }, (args) => ({
        contents: canopy.compile(readFileSync(args.path, 'utf8')),
        loader: 'js',
      }));
    }
  }],
});
`);
run('node', ['bundle.mjs'], work);

const bundle = readFileSync(join(work, 'regexper.js'));
const text = bundle.toString('utf8');
if (/<\/script/i.test(text)) throw new Error('bundle contains </script — cannot inline safely');
if (/^\s*export\s|export\{|import\.meta/m.test(text)) {
  throw new Error('bundle uses ESM — classic-script inline path cannot carry it');
}
if (!text.includes('word boundary') && !text.includes('Ignore Case')) {
  throw new Error('bundle does not look like Regexper (missing railroad labels)');
}

const header = [
  '/* Unofficial GifOS port of javallone/regexper-static @ ' + PIN,
  '   lodash ' + DEPS.lodash + ', snapsvg-cjs ' + DEPS['snapsvg-cjs'] +
    ', canopy ' + DEPS.canopy + ', esbuild ' + DEPS.esbuild + ' */',
  '',
].join('\n');
writeFileSync(join(vendor, 'regexper.js'), header + text);

function copyLic(from, to) {
  if (!existsSync(from)) throw new Error('missing license ' + from);
  copyFileSync(from, join(vendor, to));
}
copyLic(join(src, 'LICENSE.txt'), 'COPYING-regexper.txt');
copyLic(join(work, 'node_modules', 'lodash', 'LICENSE'), 'COPYING-lodash.txt');
copyLic(join(work, 'node_modules', 'snapsvg', 'LICENSE'), 'COPYING-snapsvg.txt');
copyLic(join(work, 'node_modules', 'eve', 'LICENSE'), 'COPYING-eve.txt');
copyLic(join(work, 'node_modules', 'canopy', 'LICENSE.txt'), 'COPYING-canopy.txt');

writeFileSync(join(vendor, 'COPYING-open-iconic.txt'),
`The MIT License (MIT)

Copyright (c) 2014 Iconic (P.J. Onori)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
`);

writeFileSync(join(vendor, 'UPSTREAM.txt'),
`Regexper (regexper-static) by Jeffrey Avallone (javallone)
https://github.com/javallone/regexper-static
Pinned commit: ${PIN} (master, 2018-06-06)
License: MIT (see COPYING-regexper.txt)

Bundled with the IIFE (not shipped as separate files):
  lodash ${DEPS.lodash} — MIT (COPYING-lodash.txt)
  Snap.svg via snapsvg-cjs ${DEPS['snapsvg-cjs']} — Apache-2.0 (COPYING-snapsvg.txt)
  eve (Snap.svg's event bus) — Apache-2.0 (COPYING-eve.txt)
  canopy ${DEPS.canopy} (PEG compiler, grammar compiled in) — MIT (COPYING-canopy.txt)

Open Iconic SVG sprite in index.html — MIT (COPYING-open-iconic.txt)

No Google font, no analytics, no Sentry, no CDN.
`);

writeFileSync(join(vendor, 'NOTICE.txt'),
`Regexper for GifOS bundles several MIT / Apache-2.0 works:

  Regexper          MIT         Jeffrey Avallone
  lodash            MIT         OpenJS Foundation
  Snap.svg          Apache-2.0  Adobe Systems
  eve               Apache-2.0  Dmitry Baranovskiy
  canopy            MIT         James Coglan
  Open Iconic       MIT         P.J. Onori / Iconic

The full notices live next to this file and ride inside the App GIF.
`);

const hex = createHash('sha256').update(readFileSync(join(vendor, 'regexper.js'))).digest('hex');
console.log('wrote vendor/regexper.js —', (bundle.length / 1024).toFixed(0), 'KB, sha256', hex);
console.log('pin', PIN.slice(0, 10), 'deps', Object.entries(DEPS).map(([n, v]) => n + '@' + v).join(', '));

rmSync(tmp, { recursive: true, force: true });
