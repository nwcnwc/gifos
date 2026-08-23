/*
 * vendor.mjs — rebuild vendor/ from the pinned upstream.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs. Run this only to move the pin.
 *
 *   node apps/star-battle/vendor.mjs
 *   STAR_SRC=/path/to/checkout node apps/star-battle/vendor.mjs
 *
 * WHAT IT PRODUCES. Classic scripts copied unmodified, CSS with the one
 * background url rewritten to a data URL, and an assets.js map so JS
 * Image() / Audio() paths work inside a srcdoc iframe (the runtime only
 * rewrites static src/href in HTML).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const UPSTREAM = 'https://github.com/gd4Ark/star-battle.git';
const PIN = 'b600e9e91012886f6273d6b3c91d6ab83b5eecad';

const JS = [
  'js/config/config.js',
  'js/utils/utils.js',
  'js/utils/res.js',
  'js/class/scene.js',
  'js/class/cooldown.js',
  'js/class/element.js',
  'js/class/animation.js',
  'js/class/plane.js',
  'js/class/bullet.js',
  'js/class/player.js',
  'js/class/enemy.js',
  'js/class/meteorite.js',
  'js/class/friend.js',
  'js/class/star.js',
  'js/class/fuel.js',
  'js/scenes/start.js',
  'js/scenes/play.js',
  'js/scenes/over.js',
  'js/scenes/rank.js',
  'js/game.js',
  'js/main.js',
];

const CSS = ['css/common.css', 'css/style.css'];

const PNG = [
  'img/a+.png', 'img/a-.png', 'img/boom.png', 'img/enemyBullet.png',
  'img/fuel2.png', 'img/logo-01.png', 'img/mute.png', 'img/pause.png',
  'img/play.png', 'img/playerBullet.png', 'img/score.png', 'img/speaker.png',
  'img/time3.png',
  'img/plane/player.png', 'img/plane/enemy.png', 'img/plane/friend.png',
  'img/meteorites/meteorites_1.png', 'img/meteorites/meteorites_2.png',
  'img/meteorites/meteorites_3.png', 'img/meteorites/meteorites_4.png',
];
for (let i = 1; i <= 12; i++) PNG.push('img/star/star_' + i + '.png');
const JPG = ['img/background-1.jpg'];
const MP3 = ['sound/background.mp3', 'sound/destroyed.mp3', 'sound/shoot.mp3'];

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', mp3: 'audio/mpeg',
};

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.STAR_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'star-battle-'));
  src = join(tmp, 'star-battle');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) {
  throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');
}

const vendor = join(dir, 'vendor');
mkdirSync(join(vendor, 'js', 'config'), { recursive: true });
mkdirSync(join(vendor, 'js', 'utils'), { recursive: true });
mkdirSync(join(vendor, 'js', 'class'), { recursive: true });
mkdirSync(join(vendor, 'js', 'scenes'), { recursive: true });
mkdirSync(join(vendor, 'css'), { recursive: true });
mkdirSync(join(vendor, 'img', 'plane'), { recursive: true });
mkdirSync(join(vendor, 'img', 'meteorites'), { recursive: true });
mkdirSync(join(vendor, 'img', 'star'), { recursive: true });
mkdirSync(join(vendor, 'sound'), { recursive: true });

function dataUrlFor(abs, ext) {
  const mime = MIME[ext] || 'application/octet-stream';
  return 'data:' + mime + ';base64,' + readFileSync(abs).toString('base64');
}

const assets = {};
function addAsset(rel, ext) {
  const abs = join(src, rel);
  if (!existsSync(abs)) throw new Error('upstream is missing ' + rel);
  copyFileSync(abs, join(vendor, rel));
  assets[rel] = dataUrlFor(abs, ext);
}
for (const f of PNG) addAsset(f, 'png');
for (const f of JPG) addAsset(f, 'jpg');
for (const f of MP3) addAsset(f, 'mp3');

for (const f of JS) {
  const from = join(src, f);
  if (!existsSync(from)) throw new Error('upstream is missing ' + f);
  copyFileSync(from, join(vendor, f));
}

function rewriteCssUrls(css) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, url) => {
    const u = url.trim();
    if (/^(data:|https?:|\/\/|#)/i.test(u)) return m;
    // css/style.css → ../img/background-1.jpg  ⇒  img/background-1.jpg
    const key = u.replace(/^\.\.\//, '').replace(/^\.\//, '');
    const du = assets[key];
    if (!du) throw new Error('css url not in assets map: ' + u + ' (key ' + key + ')');
    return 'url("' + du + '")';
  });
}

for (const f of CSS) {
  const raw = readFileSync(join(src, f), 'utf8');
  writeFileSync(join(vendor, f), f === 'css/style.css' ? rewriteCssUrls(raw) : raw);
}

copyFileSync(join(src, 'LICENSE'), join(vendor, 'COPYING-star-battle.txt'));

const assetLines = Object.keys(assets).sort().map((k) =>
  '  ' + JSON.stringify(k) + ': ' + JSON.stringify(assets[k]));
writeFileSync(join(vendor, 'assets.js'),
  '/* generated by vendor.mjs — data URLs for png/jpg/mp3 inside the GIF */\n' +
  'var STAR_ASSETS = {\n' + assetLines.join(',\n') + '\n};\n'
);

writeFileSync(join(vendor, 'UPSTREAM.txt'),
  'vendor/js/* and vendor/img/* and vendor/sound/* are Star Battle as shipped.\n' +
  'Do not edit them; run node apps/star-battle/vendor.mjs.\n' +
  '\n' +
  'upstream: ' + UPSTREAM.replace(/\.git$/, '') + '\n' +
  'commit:   ' + PIN + '\n' +
  'license:  MIT (COPYING-star-battle.txt)\n' +
  '\n' +
  'Classic scripts, loaded as classic scripts. js/main.js is kept for the\n' +
  'record but is not executed — boot.js starts the Game after the asset map\n' +
  'is applied. The notice travels INSIDE the GIF as well as beside it here.\n'
);

if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote vendor/ (' + JS.length + ' js, ' + (PNG.length + JPG.length + MP3.length) +
            ' assets) from ' + PIN.slice(0, 10));
console.log('  assets.js', (readFileSync(join(vendor, 'assets.js')).length / 1024).toFixed(0), 'KB');
