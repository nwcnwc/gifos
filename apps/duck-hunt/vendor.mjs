/*
 * vendor.mjs — build the pinned DuckHunt-JS from source and vendor it.
 * Run only to move the pin. Needs the network unless DUCKHUNT_SRC is set
 * (and even then npm ci needs the registry unless node_modules exists).
 *
 *   DUCKHUNT_SRC=/path/to/DuckHunt-JS node apps/duck-hunt/vendor.mjs
 *
 * WHY BUILD, NOT COPY. The committed upstream dist is INCOMPLETE: it has
 * only the entry bundle, but pixi.js v8 lazy-loads its renderer as separate
 * webpack chunks (Promise.all([i.e(369),i.e(132)]) → 369.js …) and those
 * chunk files were never committed upstream — the pinned dist cannot start a
 * renderer anywhere, let alone in a srcdoc with no server. So we npm ci +
 * webpack at the pin, then INLINE every emitted chunk after the main bundle:
 * each chunk self-registers via webpackChunkDuckHunt_JS.push(...), which
 * marks it installed so i.e(id) resolves without ever touching the network.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const UPSTREAM = 'https://github.com/MattSurabian/DuckHunt-JS.git';
const PIN = '5a28db7442ebc7dc8060342413df24c0319f4190';

// Static assets are copied from the upstream dist verbatim — pin them.
// duckhunt.js is a BUILD OUTPUT now (see header), so it has no dist pin;
// the pin for it is the source commit + the committed package-lock.json.
const PINS = {
  'sprites.png': '55d1b2ad30e5476bcf34a438c05eb0c14dea4aa336dbd1d53e0ec49330febeeb',
  'sprites.json': '4b131e6747ff03418a72ac9ebac3ec8dfd82f587b7d9d17e228f1e3455cb67a8',
  'audio.ogg': 'df182f6ee99e30ca9311cd3d057fd47abcc216fa11b7bff919f798ae9a92f507',
};

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 600000 });
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

// Build at the pin. package-lock.json is committed upstream, so npm ci gives
// the exact dependency tree (webpack included) and the build is stable.
if (!existsSync(join(src, 'node_modules'))) run('npm', ['ci', '--no-audit', '--no-fund'], src);

// The srcdoc CSP has no 'unsafe-eval', and pixi's WebGL/WebGPU uniform
// parsers are generated with new Function — the renderer refuses to init
// ("Current environment does not allow unsafe-eval") and the round never
// draws. pixi ships the official escape hatch as pixi.js/unsafe-eval;
// import it first so the eval-free parsers are installed. (Idempotent
// patch of the entry in the build checkout, before webpack runs.)
const mainJs = join(src, 'main.js');
let entry = readFileSync(mainJs, 'utf8');
const UNSAFE_EVAL_IMPORT = "import 'pixi.js/unsafe-eval';\n";
if (!entry.includes(UNSAFE_EVAL_IMPORT)) {
  if (!entry.startsWith("import Game from './src/modules/Game';")) {
    throw new Error('main.js entry moved — update vendor.mjs');
  }
  writeFileSync(mainJs, UNSAFE_EVAL_IMPORT + entry);
}
run('npx', ['webpack', '--mode', 'production'], src);

const stripMap = (s) => s.replace(/\/\/# sourceMappingURL=\S*\s*$/g, '');
let js = stripMap(readFileSync(join(dist, 'duckhunt.js'), 'utf8'));

// Every lazy chunk the main bundle can request must exist in the build.
const wanted = new Set([...js.matchAll(/i\.e\((\d+)\)/g)].map((m) => m[1]));
const chunkFiles = readdirSync(dist).filter((n) => /^\d+\.js$/.test(n)).sort((a, b) => parseInt(a) - parseInt(b));
const have = new Set(chunkFiles.map((n) => n.replace(/\.js$/, '')));
for (const id of wanted) {
  if (!have.has(id)) throw new Error('main bundle requests chunk ' + id + ' but the build emitted no ' + id + '.js');
}

// webpack's "automatic publicPath" runtime derives i.p from
// document.currentScript.src / a <script src> scan. GifOS inlines every
// script into the srcdoc, so there IS no src and the runtime THROWS at
// top level, killing the whole bundle (DuckHuntStart never defined).
// Fall back to "" instead: chunks are inlined below, sprites ride the
// fetch hook and audio is a data: URL, so the path is never used.
const PP_THROW = 'if(!t)throw new Error("Automatic publicPath is not supported in this browser");';
if (!js.includes(PP_THROW)) {
  throw new Error('automatic-publicPath snippet moved — update vendor.mjs');
}
js = js.replace(PP_THROW, 'if(!t)t="";');

// pixi's texture loader probes ImageBitmap support by spinning up a blob:
// worker and WAITING for its message — under the srcdoc CSP (script-src
// 'unsafe-inline', no worker-src) the worker is refused, the message never
// comes, and the spritesheet load hangs forever with no canvas and no
// error. Prefer the direct fetch+createImageBitmap path instead; the fetch
// rides the app's fetch hook.
const PW = 'config:{preferWorkers:!0,preferCreateImageBitmap:!0,crossOrigin:"anonymous"}';
if (!js.includes(PW)) throw new Error('loadTextures preferWorkers config moved — update vendor.mjs');
js = js.replace(PW, 'config:{preferWorkers:!1,preferCreateImageBitmap:!0,crossOrigin:"anonymous"}');

// Don't auto-boot on DOMContentLoaded — GifOS shows a gate first. The
// minified class name shifts between builds, so match it loosely.
const BOOT_RE = /document\.addEventListener\("DOMContentLoaded",function\(\)\{new ([A-Za-z$_][\w$]*)\(\{spritesheet:"sprites\.json"\}\)\.load\(\)\},!1\)/;
const bootHit = js.match(BOOT_RE);
if (!bootHit) throw new Error('boot snippet moved — update vendor.mjs');
js = js.replace(BOOT_RE, 'window.DuckHuntStart=function(){var g=new ' + bootHit[1] + '({spritesheet:"sprites.json"});window.__DHGame=g;g.load();return g}');

function once(src, a, b, label) {
  const n = src.split(a).length - 1;
  if (n !== 1) throw new Error('gifos patch ' + label + ' hit ' + n);
  return src.replace(a, b);
}
js = once(js,
  'set:function(t){this.scoreVal=t,this.stage&&this.stage.hud&&(Object.prototype.hasOwnProperty.call(this.stage.hud,"score")',
  'set:function(t){this.scoreVal=t,window.DHSave&&window.DHSave.onScore(t),this.stage&&this.stage.hud&&(Object.prototype.hasOwnProperty.call(this.stage.hud,"score")',
  'score');
js = once(js,
  'this.gameStatus="You Win!",this.showReplay(this.getScoreMessage())',
  'this.gameStatus="You Win!",window.DHSave&&window.DHSave.onEnd(!0,this.score),this.showReplay(this.getScoreMessage())',
  'win');
js = once(js,
  'this.gameStatus="You Lose!",this.showReplay(this.getScoreMessage())',
  'this.gameStatus="You Lose!",window.DHSave&&window.DHSave.onEnd(!1,this.score),this.showReplay(this.getScoreMessage())',
  'loss');
js = once(js, 'window.location=window.location.pathname', 'window.DHSave&&window.DHSave.replay()', 'replay');
js = once(js, 'window.open("/creator.html","_blank")', 'window.DHSave&&window.DHSave.noop()', 'creator');
js = once(js, 'this.stage.hud.levelCreatorLink="level creator (c)"', 'this.stage.hud.levelCreatorLink=""', 'creatorLink');
js = once(js, '"c"===e.key&&t.openLevelCreator(),', '', 'keyC');
js = once(js,
  'this.updateScore(this.stage.shotsFired(e,this.level.radius))',
  'this.updateScore(this.stage.shotsFired(e,this.level.radius+("touch"===t.pointerType||"pen"===t.pointerType?28:0)))',
  'touch');

// Howler: the ogg sprite becomes a data: URL so nothing is ever fetched.
const oggUrl = 'data:audio/ogg;base64,' + bufs['audio.ogg'].toString('base64');
if (!js.includes('"src":["audio.ogg","audio.mp3"]')) {
  throw new Error('howler src snippet moved — update vendor.mjs');
}
js = js.replace('"src":["audio.ogg","audio.mp3"]', '"src":[' + JSON.stringify(oggUrl) + ']');

// Append the lazy chunks. Each is a jsonp-style self-registration
// ((self.webpackChunkDuckHunt_JS=...).push([[id],{...}])) — running AFTER
// the main bundle marks the chunk installed, so i.e(id) resolves locally.
for (const n of chunkFiles) {
  js += '\n' + stripMap(readFileSync(join(dist, n), 'utf8'));
}

// The extracted third-party license banners (pixi / howler / gsap) ride at
// the top of the bundle so attribution stays inside the artifact.
const licTxt = join(dist, 'duckhunt.js.LICENSE.txt');
if (existsSync(licTxt)) {
  const lic = readFileSync(licTxt, 'utf8');
  if (lic.includes('*/') === false) throw new Error('LICENSE.txt has no comment blocks?');
  js = lic.trimEnd() + '\n' + js;
}

if (/<\/script/i.test(js)) throw new Error('bundle contains </script — cannot ride an inline srcdoc');
if (!js.includes('DuckHuntStart')) throw new Error('DuckHuntStart patch missing');
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
  'built:   npm ci + webpack --mode production at the pin (see vendor.mjs —\n' +
  '         the committed upstream dist is missing the pixi.js v8 lazy\n' +
  '         renderer chunks, so we build and inline chunks ' +
  chunkFiles.map((n) => n.replace(/\.js$/, '')).join(' ') + ')\n' +
  'assets:  dist/sprites.png dist/sprites.json dist/audio.ogg\n' +
  'sha256:  sprites.png ' + PINS['sprites.png'] + '\n' +
  '         sprites.json ' + PINS['sprites.json'] + '\n' +
  '         audio.ogg    ' + PINS['audio.ogg'] + '\n' +
  'license: MIT, Copyright (c) 2015 Matt Surabian (COPYING-duckhunt.txt)\n' +
  '\n' +
  'Vendored playable build (Pixi / Howler / GSAP). Audio is the ogg sprite,\n' +
  'inlined as a data URL so Howler never fetches. Spritesheet JSON + PNG\n' +
  'are served from a fetch hook (no network). The webpack bundle is patched\n' +
  'to expose DuckHuntStart instead of auto-booting, and its automatic\n' +
  'publicPath runtime falls back to "" instead of throwing (an inlined\n' +
  'srcdoc script has no src to derive a path from).\n' +
  'Looks like the NES zapper game — unofficial, same class as floppy-bird.\n'
);
console.log('wrote vendor/duckhunt.js', (js.length / 1024).toFixed(0), 'KB (main + ' +
            chunkFiles.length + ' chunks); assets.js', (assets.length / 1024).toFixed(0), 'KB');
if (tmp) rmSync(tmp, { recursive: true, force: true });
