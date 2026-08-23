/*
 * vendor.mjs — rebuild vendor/ from the pinned Alhissar/Yahtzee commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/yahtzee/vendor.mjs
 *   YAHTZEE_SRC=/path/to/checkout node apps/yahtzee/vendor.mjs
 *
 * WHAT IT PRODUCES. The original JS converted to classic scripts (GifOS drops
 * type=module), main.css with image url() inlined as data URIs (the runtime
 * inlines <link rel=stylesheet> as <style>, so a relative url("images/…")
 * would 404), the images the HTML <img> tags load, and the MIT notice.
 *
 * main.js is NOT copied: boot is app.js (wait for art, then new Dices/Player).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');
const imgOut = join(out, 'images');

const UPSTREAM = 'https://github.com/Alhissar/Yahtzee.git';
const PIN = 'a85a38aefb3aafe6613a4533da14a401e7ed0313'; // 2019-06-21 "game over, new game"

const JS = ['Card.js', 'Dices.js', 'Player.js', 'functions.js'];
const HTML_IMAGES = ['colors_small.png', 'numbers.png', 'scores.jpg'];
const CSS_IMAGES = ['fond.jpg', 'card.jpg', 'back.jpg', 'numbers.png'];

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.YAHTZEE_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'yahtzee-'));
  src = join(tmp, 'Yahtzee');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) {
  throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');
}

mkdirSync(imgOut, { recursive: true });

function dataUrl(abs) {
  const ext = abs.split('.').pop().toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  return 'data:' + mime + ';base64,' + readFileSync(abs).toString('base64');
}

function toClassic(srcText, name) {
  let s = srcText.replace(/^\uFEFF/, '');
  s = s.replace(/^import\s+[^;]+;\s*\n/gm, '');
  s = s.replace(/^export\s+default\s+/gm, '');
  s = s.replace(/^export\s+/gm, '');
  // class / const / let at top level of a classic <script> do not leak to the
  // next tag. var does. The original is ESM classes; we keep the class body
  // and bind it on a var so app.js can `new Dices()` / `new Player()`.
  s = s.replace(/^class\s+(\w+)/m, 'var $1 = class $1');
  if (name === 'Player.js') {
    // Original constructed a second Dices (and five extra cards) at import
    // time, only to call yahtzee/full/straight/sameDice. Classic scripts share
    // one display Dices from app.js; scoring uses a prototype object, no cards.
    if (!s.includes('const dices = new Dices()')) {
      throw new Error('Player.js no longer constructs Dices at import — the scoring patch has nothing to replace.');
    }
    s = s.replace(/const dices = new Dices\(\);\s*/,
      'function scoringDices() {\n' +
      '  if (!scoringDices._d) {\n' +
      '    scoringDices._d = Object.create(Dices.prototype);\n' +
      '    scoringDices._d.result = [0, 0, 0, 0, 0, 0];\n' +
      '    scoringDices._d.ordered = [];\n' +
      '  }\n' +
      '  return scoringDices._d;\n' +
      '}\n');
    s = s.replace(/\bdices\.(yahtzee|isFull|isStraight|sameDice)/g, 'scoringDices().$1');
    if (/\bdices\.(yahtzee|isFull|isStraight|sameDice)/.test(s) || /\bnew Dices\s*\(/.test(s)) {
      throw new Error('Player.js still talks to a Dices instance — scoring patch incomplete.');
    }
  }
  if (/^\s*import\s/m.test(s) || /export\s+\{/.test(s) || /^export\s/m.test(s)) {
    throw new Error(name + ' still has ESM after conversion.');
  }
  if (/<\/script/i.test(s)) throw new Error(name + ' contains </script — cannot inline safely.');
  return s;
}

for (const f of JS) {
  const classic = toClassic(readFileSync(join(src, 'js', f), 'utf8'), f);
  writeFileSync(join(out, f), classic);
}

for (const name of HTML_IMAGES) {
  copyFileSync(join(src, 'images', name), join(imgOut, name));
}

let css = readFileSync(join(src, 'main.css'), 'utf8');
css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, _q, rel) => {
  const file = rel.replace(/^\.\//, '');
  const abs = join(src, file);
  return 'url("' + dataUrl(abs) + '")';
});
{
  const rel = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1/g)]
    .map((m) => m[2])
    .filter((u) => !u.startsWith('data:'));
  if (rel.length) {
    throw new Error('vendor/main.css still has a relative url() — images would 404 once the stylesheet is inlined: ' + rel[0]);
  }
}
writeFileSync(join(out, 'main.css'), css);

copyFileSync(join(src, 'LICENSE'), join(out, 'COPYING-yahtzee.txt'));

const sha = (p) => createHash('sha256').update(readFileSync(join(out, p))).digest('hex');
const pins = {
  'Card.js': sha('Card.js'),
  'Dices.js': sha('Dices.js'),
  'Player.js': sha('Player.js'),
  'functions.js': sha('functions.js'),
  'main.css': sha('main.css'),
  'COPYING-yahtzee.txt': sha('COPYING-yahtzee.txt'),
};

writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/yahtzee/vendor.mjs.

upstream: ${UPSTREAM}
commit:   ${PIN}
date:     2019-06-21
license:  MIT (COPYING-yahtzee.txt)

Classic scripts converted from js/ (ESM import/export stripped; class Foo
bound on var Foo so a later classic script can see it):
  ${JS.join('\n  ')}

NOT copied:
  js/main.js                 — boot is app.js (wait for art, then new Dices/Player)
  images/back2.jpg           — unused
  images/cardTemplate.jpg    — unused

Player.js originally did \`const dices = new Dices()\` at import, constructing
five extra cards on the same canvases. scoringDices() is a Dices.prototype
object with no cards, used only for yahtzee / full / straight / sameDice.

style/main.css image url() (fond.jpg, card.jpg, back.jpg, numbers.png) are
data URIs. HTML <img> files still ride as vendor/images/* so the runtime can
rewrite src= to a data URL.

sha256:
${Object.entries(pins).map(([k, v]) => '  ' + k + '  ' + v).join('\n')}

The MIT notice travels INSIDE the GIF as COPYING-yahtzee.txt as well as here.
`);

if (tmp) rmSync(tmp, { recursive: true, force: true });

if (!css.includes('data:image')) throw new Error('css data URIs missing');
void CSS_IMAGES;

console.log('wrote apps/yahtzee/vendor/ —', JS.length, 'js files + main.css (images inlined) + COPYING-yahtzee.txt');
console.log('pin', PIN.slice(0, 10), 'Dices.js', pins['Dices.js'].slice(0, 12) + '…');
