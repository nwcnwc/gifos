/*
 * vendor.mjs — rebuild vendor/ from the pinned upstream.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs. Run this only to move the pin.
 *
 *   node apps/invaderz/vendor.mjs
 *   INVADERZ_SRC=/path/to/checkout node apps/invaderz/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const UPSTREAM = 'https://github.com/victorqribeiro/invaderz.git';
const PIN = 'a3ac9574f7a1904fb74d7fdff22b9b2e7c94a310';

const JS = ['Invader.js', 'Player.js', 'Genetics.js', 'main.js'];

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.INVADERZ_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'invaderz-'));
  src = join(tmp, 'invaderz');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) {
  throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');
}

const outJs = join(dir, 'vendor');
mkdirSync(outJs, { recursive: true });
for (const f of JS) {
  const from = join(src, 'js', f);
  if (!existsSync(from)) throw new Error('upstream is missing js/' + f);
  copyFileSync(from, join(outJs, f));
}
copyFileSync(join(src, 'LICENSE'), join(dir, 'vendor', 'COPYING-invaderz.txt'));

writeFileSync(join(dir, 'vendor', 'UPSTREAM.txt'),
  'vendor/*.js is InvaderZ as shipped. Do not edit it; run node apps/invaderz/vendor.mjs.\n' +
  '\n' +
  'upstream: ' + UPSTREAM.replace(/\.git$/, '') + '\n' +
  'commit:   ' + PIN + '\n' +
  'license:  MIT (COPYING-invaderz.txt)\n' +
  '\n' +
  'Invader.js, Player.js and Genetics.js are loaded as classic scripts. main.js\n' +
  'is kept for the record but is not executed — it registered a service worker\n' +
  'and an appcache, and it owns a single cannon. The GifOS loop (game.js) is\n' +
  'ordinary source beside this directory. The notice travels INSIDE the GIF as\n' +
  'well as beside it here.\n'
);

if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote vendor/ (' + JS.length + ' js files) from ' + PIN.slice(0, 10));
