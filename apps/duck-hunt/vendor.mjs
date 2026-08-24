/*
 * vendor.mjs — pin the committed DuckHunt-JS dist into vendor/.
 * Run only to move the pin. Needs the network unless DUCKHUNT_SRC is set.
 *
 *   DUCKHUNT_SRC=/path/to/DuckHunt-JS node apps/duck-hunt/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const UPSTREAM = 'https://github.com/MattSurabian/DuckHunt-JS.git';
const PIN = '5a28db7442ebc7dc8060342413df24c0319f4190';

const PINS = {
  'duckhunt.js': 'fca8b3198a28c06d60c16164a2415047e0da566392e18655bce92dd37f38c2ca',
  'sprites.png': '55d1b2ad30e5476bcf34a438c05eb0c14dea4aa336dbd1d53e0ec49330febeeb',
  'sprites.json': '4b131e6747ff03418a72ac9ebac3ec8dfd82f587b7d9d17e228f1e3455cb67a8',
  'audio.ogg': 'df182f6ee99e30ca9311cd3d057fd47abcc216fa11b7bff919f798ae9a92f507',
};

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });
function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

let src = process.env.DUCKHUNT_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'duckhunt-'));
  src = join(tmp, 'DuckHunt-JS');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN);

const dist = join(src, 'dist');
const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });

const bufs = {};
for (const name of Object.keys(PINS)) {
  const buf = readFileSync(join(dist, name));
  const hex = sha256(buf);
  if (hex !== PINS[name]) throw new Error(name + ' sha256 ' + hex + ' ≠ pin ' + PINS[name]);
  bufs[name] = buf;
  copyFileSync(join(dist, name), join(vendor, name));
}
copyFileSync(join(src, 'LICENSE'), join(vendor, 'COPYING-duckhunt.txt'));

let js = bufs['duckhunt.js'].toString('utf8');
js = js.replace(/\/\/# sourceMappingURL=.*$/, '');
if (!js.includes('document.addEventListener("DOMContentLoaded",function(){new Aa({spritesheet:"sprites.json"}).load()},!1)')) {
  throw new Error('boot snippet moved — update vendor.mjs');
}
js = js.replace(
  'document.addEventListener("DOMContentLoaded",function(){new Aa({spritesheet:"sprites.json"}).load()},!1)',
  'window.DuckHuntStart=function(){new Aa({spritesheet:"sprites.json"}).load()}'
);
const oggUrl = 'data:audio/ogg;base64,' + bufs['audio.ogg'].toString('base64');
if (!js.includes('"src":["audio.ogg","audio.mp3"]')) {
  throw new Error('howler src snippet moved — update vendor.mjs');
}
js = js.replace('"src":["audio.ogg","audio.mp3"]', '"src":[' + JSON.stringify(oggUrl) + ']');
writeFileSync(join(vendor, 'duckhunt.js'), js);

const spritesJson = JSON.parse(bufs['sprites.json'].toString('utf8'));
const assets = [
  'window.__DH = window.__DH || {};',
  'window.__DH.spritesJson = ' + JSON.stringify(spritesJson) + ';',
  'window.__DH.spritesPngB64 = ' + JSON.stringify(bufs['sprites.png'].toString('base64')) + ';',
].join('\n');
writeFileSync(join(vendor, 'assets.js'), assets);

writeFileSync(join(vendor, 'UPSTREAM.txt'),
  'MattSurabian/DuckHunt-JS\n' +
  'https://github.com/MattSurabian/DuckHunt-JS\n' +
  'commit:  ' + PIN + '\n' +
  'files:   dist/duckhunt.js dist/sprites.png dist/sprites.json dist/audio.ogg\n' +
  'sha256:  duckhunt.js ' + PINS['duckhunt.js'] + '\n' +
  '         sprites.png ' + PINS['sprites.png'] + '\n' +
  '         sprites.json ' + PINS['sprites.json'] + '\n' +
  '         audio.ogg    ' + PINS['audio.ogg'] + '\n' +
  'license: MIT, Copyright (c) 2015 Matt Surabian (COPYING-duckhunt.txt)\n' +
  '\n' +
  'Vendored playable dist (Pixi / Howler / GSAP). Audio is the ogg sprite,\n' +
  'inlined as a data URL so Howler never fetches. Spritesheet JSON + PNG\n' +
  'are served from a fetch hook (no network). The webpack bundle is patched\n' +
  'to expose DuckHuntStart instead of auto-booting.\n' +
  'Looks like the NES zapper game — unofficial, same class as floppy-bird.\n'
);
console.log('wrote vendor/duckhunt.js', (js.length / 1024).toFixed(0), 'KB; assets.js',
            (assets.length / 1024).toFixed(0), 'KB');
if (tmp) rmSync(tmp, { recursive: true, force: true });
