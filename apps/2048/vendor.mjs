/*
 * vendor.mjs — rebuild vendor/ from the pinned gabrielecirulli/2048 commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/2048/vendor.mjs
 *   G2048_SRC=/path/to/checkout node apps/2048/vendor.mjs
 *
 * WHAT IT PRODUCES. The original classic scripts (already IIFE-free globals —
 * 2048 never used modules), the compiled main.css with Clear Sans inlined as
 * data URIs (the runtime inlines <link rel=stylesheet> as <style>, so a
 * relative url("fonts/…") would 404), and the MIT notice. local_storage_manager
 * and application.js are NOT copied: storage is gifos.db, and boot is ours.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');

const UPSTREAM = 'https://github.com/gabrielecirulli/2048.git';
const PIN = '478b6ec346e3787f589e4af751378d06ded4cbbc'; // 2024-10-24 "Update README.md"

const JS = [
  'bind_polyfill.js',
  'classlist_polyfill.js',
  'animframe_polyfill.js',
  'keyboard_input_manager.js',
  'html_actuator.js',
  'grid.js',
  'tile.js',
  'game_manager.js',
];

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.G2048_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'g2048-'));
  src = join(tmp, '2048');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) {
  throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');
}

mkdirSync(out, { recursive: true });
for (const f of JS) copyFileSync(join(src, 'js', f), join(out, f));
copyFileSync(join(src, 'LICENSE.txt'), join(out, 'COPYING-2048.txt'));

function woffData(name) {
  const buf = readFileSync(join(src, 'style', 'fonts', name));
  return 'data:font/woff;base64,' + buf.toString('base64');
}

const faces = [
  { file: 'ClearSans-Light-webfont.woff', weight: '200' },
  { file: 'ClearSans-Regular-webfont.woff', weight: 'normal' },
  { file: 'ClearSans-Bold-webfont.woff', weight: '700' },
];
let fontCss = '/* Clear Sans, Apache-2.0, as bundled by gabrielecirulli/2048. Inlined because GifOS inlines stylesheets. */\n';
for (const f of faces) {
  fontCss += '@font-face{font-family:"Clear Sans";src:url("' + woffData(f.file) + '") format("woff");font-weight:' + f.weight + ';font-style:normal;font-display:swap;}\n';
}

const main = readFileSync(join(src, 'style', 'main.css'), 'utf8').replace(/^@import url\(fonts\/clear-sans\.css\);\s*/m, '');
const css = fontCss + '\n' + main;
{
  const rel = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1/g)].map((m) => m[2]).filter((u) => !u.startsWith('data:'));
  if (rel.length) throw new Error('vendor/main.css still has a relative url() — fonts would 404 once the stylesheet is inlined: ' + rel[0]);
}
writeFileSync(join(out, 'main.css'), css);

for (const f of JS.concat(['COPYING-2048.txt', 'main.css'])) {
  if (/<\/script/i.test(readFileSync(join(out, f), 'utf8'))) {
    throw new Error(f + ' contains </script — cannot inline safely.');
  }
}

const sha = (p) => createHash('sha256').update(readFileSync(join(out, p))).digest('hex');
const pins = {
  'game_manager.js': sha('game_manager.js'),
  'grid.js': sha('grid.js'),
  'keyboard_input_manager.js': sha('keyboard_input_manager.js'),
  'html_actuator.js': sha('html_actuator.js'),
  'COPYING-2048.txt': sha('COPYING-2048.txt'),
};

writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/2048/vendor.mjs.

upstream: ${UPSTREAM}
commit:   ${PIN}
date:     2024-10-24
license:  MIT (COPYING-2048.txt)

Classic scripts copied as-is from js/:
  ${JS.join('\n  ')}

NOT copied:
  js/local_storage_manager.js  — sandbox has no localStorage; storage.js talks to gifos.db
  js/application.js            — boot is app.js (load save, then new GameManager)
  favicon / apple-touch images — the GIF preview is the icon
  style/main.scss + helpers    — we ship the already-compiled main.css

style/main.css is the upstream file with @import of Clear Sans replaced by
@font-face data URIs (woff). Clear Sans is Apache-2.0, bundled by upstream.

sha256:
${Object.entries(pins).map(([k, v]) => '  ' + k + '  ' + v).join('\n')}

The MIT notice travels INSIDE the GIF as COPYING-2048.txt as well as here.
`);

if (tmp) rmSync(tmp, { recursive: true, force: true });

console.log('wrote apps/2048/vendor/ —', JS.length, 'js files + main.css (Clear Sans inlined) + COPYING-2048.txt');
console.log('pin', PIN.slice(0, 10), 'game_manager.js', pins['game_manager.js'].slice(0, 12) + '…');

