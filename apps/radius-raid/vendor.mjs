/*
 * vendor.mjs — rebuild vendor/js from the pinned upstream.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs. Run this only to move the pin.
 *
 *   node apps/radius-raid/vendor.mjs
 *   RR_SRC=/path/to/checkout node apps/radius-raid/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const UPSTREAM = 'https://github.com/jackrugile/radius-raid-js13k.git';
const PIN = '361ab5166570cfc8a29a4fc15c9afba566117b66';

const JS = [
  'jsfxr.js', 'util.js', 'storage.js', 'definitions.js', 'audio.js', 'text.js',
  'hero.js', 'enemy.js', 'bullet.js', 'explosion.js', 'powerup.js', 'particle.js',
  'particleemitter.js', 'textpop.js', 'levelpop.js', 'button.js', 'game.js',
];

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.RR_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'rr-'));
  src = join(tmp, 'rr');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) {
  throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');
}

const outJs = join(dir, 'vendor', 'js');
mkdirSync(outJs, { recursive: true });
for (const f of JS) {
  const from = join(src, 'js', f);
  if (!existsSync(from)) throw new Error('upstream is missing js/' + f);
  copyFileSync(from, join(outJs, f));
}
copyFileSync(join(src, 'LICENSE.md'), join(dir, 'vendor', 'COPYING-radius-raid.txt'));

writeFileSync(join(dir, 'vendor', 'UPSTREAM.txt'),
  'vendor/js/* is Radius Raid as shipped. Do not edit it; run node apps/radius-raid/vendor.mjs.\n' +
  '\n' +
  'upstream: ' + UPSTREAM.replace(/\.git$/, '') + '\n' +
  'commit:   ' + PIN + '\n' +
  'license:  MIT (COPYING-radius-raid.txt)\n' +
  '\n' +
  'The GifOS layer (boot, touch sticks, netplay) is ordinary source beside this\n' +
  'directory. The notice travels INSIDE the GIF as well as beside it here.\n'
);

if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote vendor/js (' + JS.length + ' files) from ' + PIN.slice(0, 10));
