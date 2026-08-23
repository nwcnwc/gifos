/*
 * vendor.mjs — rebuild vendor/ from the pinned upstream.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs. Run this only to move the pin.
 *
 *   node apps/underrun/vendor.mjs
 *   UNDERRUN_SRC=/path/to/checkout node apps/underrun/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const UPSTREAM = 'https://github.com/phoboslab/underrun.git';
const PIN = 'f933e29152d7fc1ca61d4b3eaa8b29551d7d7a62';

const JS = [
  'game.js', 'random.js', 'renderer.js', 'entity.js',
  'entity-cpu.js', 'entity-player.js', 'entity-plasma.js',
  'entity-spider.js', 'entity-sentry.js', 'entity-particle.js',
  'entity-health.js', 'entity-explosion.js',
  'sonantx-reduced.js', 'music-dark-meat-beat.js', 'sound-effects.js',
  'audio.js', 'terminal.js', 'main.js',
];
const PNG = ['l1.png', 'l2.png', 'l3.png', 'q2.png'];

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.UNDERRUN_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'underrun-'));
  src = join(tmp, 'underrun');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) {
  throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');
}

const outJs = join(dir, 'vendor');
const outPng = join(dir, 'vendor', 'm');
mkdirSync(outPng, { recursive: true });
for (const f of JS) {
  const from = join(src, 'source', f);
  if (!existsSync(from)) throw new Error('upstream is missing source/' + f);
  copyFileSync(from, join(outJs, f));
}
for (const f of PNG) {
  const from = join(src, 'm', f);
  if (!existsSync(from)) throw new Error('upstream is missing m/' + f);
  copyFileSync(from, join(outPng, f));
}
copyFileSync(join(src, 'LICENSE.md'), join(dir, 'vendor', 'COPYING-underrun.txt'));

const sonant = readFileSync(join(src, 'source', 'sonantx-reduced.js'), 'utf8');
const zlibLines = sonant.split(/\r?\n/).slice(3, 32)
  .map((l) => l.replace(/^\/\/\s?/, ''))
  .join('\n')
  .trim();
if (!zlibLines.includes('Sonant-X') || !zlibLines.includes('source')) {
  throw new Error('could not extract the Sonant-X zlib notice from sonantx-reduced.js');
}
writeFileSync(join(dir, 'vendor', 'COPYING-sonantx.txt'), zlibLines + '\n');

writeFileSync(join(dir, 'vendor', 'UPSTREAM.txt'),
  'vendor/*.js and vendor/m/* are Underrun as shipped. Do not edit them; run\n' +
  'node apps/underrun/vendor.mjs.\n' +
  '\n' +
  'upstream: ' + UPSTREAM.replace(/\.git$/, '') + '\n' +
  'commit:   ' + PIN + '\n' +
  'license:  MIT (COPYING-underrun.txt)\n' +
  'sonant-x: zlib (COPYING-sonantx.txt) — a reduced copy, already in upstream\n' +
  'music:    Andreas Lösch, no-fate.net (shipped as part of the MIT tree)\n' +
  '\n' +
  'The GifOS layer (boot, twin-stick, extra soldiers) is ordinary source\n' +
  'beside this directory. The notices travel INSIDE the GIF as well as\n' +
  'beside them here.\n'
);

if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote vendor/ (' + JS.length + ' js, ' + PNG.length + ' png) from ' + PIN.slice(0, 10));
