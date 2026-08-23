/*
 * vendor.mjs — rebuild vendor/* from the pinned Classic-Pool-Game commit.
 *
 * This is the ONLY step that needs the network (and ImageMagick `convert`
 * for the table JPEG), and it is deliberately NOT part of build.mjs: the
 * App GIF must be buildable offline from what is committed here. Run this
 * only to move the pin.
 *
 *   node apps/pool/vendor.mjs
 *   POOL_SRC=/path/to/checkout node apps/pool/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

// Moving the pin is a deliberate act: bump COMMIT + each SHA256 together.
const COMMIT = 'f60e9b824648faabe1d931e9116b20333559da2a';
const UPSTREAM = 'https://github.com/henshmi/Classic-Pool-Game.git';
const RAW = 'https://raw.githubusercontent.com/henshmi/Classic-Pool-Game/' + COMMIT + '/';

const JS = [
  { src: 'script/system/Keys.js', out: 'Keys.js', sha256: 'f3711612d368691b4e0f208dc732b158964194cd0eebcdd996394598509d69a2' },
  { src: 'script/system/Color.js', out: 'Color.js', sha256: '738b844678677a3f189f96469cf35724b0dee3afa35d510125de1e48e13e213c' },
  { src: 'script/geom/Vector2.js', out: 'Vector2.js', sha256: '5144363b499e99df6a247d26d55cf9b6a400ab1b8cf3cec9a04dde697bc42f09' },
  { src: 'script/input/ButtonState.js', out: 'ButtonState.js', sha256: '3dc497e9932c79f75eddffbeec86bf8c17033ffc7f181beab959ea0afa57b507' },
  { src: 'script/input/Keyboard.js', out: 'Keyboard.js', sha256: 'b9d1ce94070f35145b4658d54fa35f3bf910a0490c0d6d03540e52ac9e00a2c2' },
  { src: 'script/input/Mouse.js', out: 'Mouse.js', sha256: 'beca4bd3176297380ef19d99c4751a94ac80e39d430d1cb4a2473f3c2cd6a53f' },
  { src: 'script/Global.js', out: 'Global.js', sha256: '1433f986447588aeb43b974e8e8c76a4df8864775e950ca7e3bd12b3ecfabf4e' },
  { src: 'script/Canvas2D.js', out: 'Canvas2D.js', sha256: 'b4a1f345c83dff5e6577b3bf3ab814e2bb191c32f1053cb48f716327cc6c93aa' },
  { src: 'script/game_objects/Score.js', out: 'Score.js', sha256: '88851434484a3ccdf870058dd661eb56e652290e44f15d54daacbad92a321a20' },
  { src: 'script/game_objects/Ball.js', out: 'Ball.js', sha256: '34e8fc5804bab2e47399b9c3d44982188ec61c01cacb86f71488c893617236d5' },
  { src: 'script/game_objects/Stick.js', out: 'Stick.js', sha256: '6b3a4e4601ad31abb01437936f43955fe017684e21c126b938e0ee0542cc0f05' },
  { src: 'script/game_objects/Player.js', out: 'Player.js', sha256: '5154166109d266263e43f9be36e053da7c006bf37fd4d0ae6b7d3a508a3a3edc' },
  { src: 'script/AI/Opponent.js', out: 'Opponent.js', sha256: '3c2e15cf3f65a0ddb1758e5b45c90a2a23013dc8908042529b908b612c613284' },
  { src: 'script/AI/AIPolicy.js', out: 'AIPolicy.js', sha256: '60a722750e7df799ef6e6566b3b987321d5d6793acb66e1420da6cb7c0d92d0d' },
  { src: 'script/AI/AITrainer.js', out: 'AITrainer.js', sha256: 'a3dc9a9033b97c898db9f7af525c6f99452ecb8dc047591ac1a291c39e98a3a2' },
  { src: 'script/GamePolicy.js', out: 'GamePolicy.js', sha256: '8369a384a7428aa502530a4bbbfc2e5e6f479720a0baa253a5b60a3b58fd554e' },
  { src: 'script/GameWorld.js', out: 'GameWorld.js', sha256: '145e64acb0a6634679ca4a0f2204090a33f7e403fc298fcb2a28dfada5aca7d6' },
  { src: 'script/Game.js', out: 'Game.js', sha256: 'd4c67a0a64900472128fc71f7fd130a9cada72e2f64f27a97b69767a363c5446' },
];

const SPRITES = [
  { src: 'assets/sprites/spr_ball2.png', out: 'spr_ball2.png', sha256: '1fbeacf71a924f5a8e344a4c5c505dcc55121f5002842daf1b618a4dd305e7bf' },
  { src: 'assets/sprites/spr_redBall2.png', out: 'spr_redBall2.png', sha256: '9ab258c36dcbe65e70f45c278316d16a20ea75b09443e0d465519f101a9598cc' },
  { src: 'assets/sprites/spr_yellowBall2.png', out: 'spr_yellowBall2.png', sha256: '2b17f698ca84b16762ab8ccd78d16079c881b0b5f0d50aa928e1bcd1b406b5e8' },
  { src: 'assets/sprites/spr_blackBall2.png', out: 'spr_blackBall2.png', sha256: '9d2dcea9d674d704902f40fd8753a2fcf41f9c7784b4cd9e3764b1dea58b3f37' },
  { src: 'assets/sprites/spr_stick.png', out: 'spr_stick.png', sha256: '1340a4ca412470fae7f01546c72954c0dcdd713b7aa19970a8f4433f3cd23aa1' },
];

const BG = { src: 'assets/sprites/spr_background4.png', sha256: 'ba75df35fb83f06ec1c21664b139a45dcca41b180e6d31daadaa8c1abc1581f0' };
const LICENSE = { src: 'LICENSE.txt', sha256: '760553a0813d45d17d49fb878035962a93bf537603d5ab2da2df8d562ad8d3a0' };

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

function check(name, buf, hex) {
  const got = sha256(buf);
  if (got !== hex) throw new Error(name + ' sha256 ' + got + ' ≠ pin ' + hex + ' — move the pin deliberately.');
  if (name.endsWith('.js') && /<\/script/i.test(buf.toString('utf8'))) {
    throw new Error(name + ' contains </script — cannot inline safely.');
  }
}

const vendor = join(dir, 'vendor');
const sprOut = join(vendor, 'sprites');
mkdirSync(sprOut, { recursive: true });

let src = process.env.POOL_SRC;
let tmp = null;
if (src) {
  const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
  if (at !== COMMIT) throw new Error('checkout is at ' + at + ', not the pin ' + COMMIT + ' — move COMMIT deliberately.');
}

function load(rel) {
  if (src) {
    const abs = join(src, rel);
    if (!existsSync(abs)) throw new Error('missing ' + rel);
    return readFileSync(abs);
  }
  return null;
}

async function fetchBuf(rel) {
  const fromDisk = load(rel);
  if (fromDisk) return fromDisk;
  const url = RAW + rel;
  const res = await fetch(url);
  if (!res.ok) throw new Error('download failed: ' + res.status + ' ' + url);
  return Buffer.from(await res.arrayBuffer());
}

if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'classic-pool-'));
  src = join(tmp, 'Classic-Pool-Game');
  console.log('cloning ' + UPSTREAM + ' @ ' + COMMIT.slice(0, 10) + '…');
  execFileSync('git', ['clone', '--quiet', UPSTREAM, src], { timeout: 120000 });
  execFileSync('git', ['checkout', '--quiet', COMMIT], { cwd: src, timeout: 30000 });
}

for (const f of JS) {
  const buf = readFileSync(join(src, f.src));
  check(f.src, buf, f.sha256);
  writeFileSync(join(vendor, f.out), buf);
  console.log('wrote vendor/' + f.out + ' —', buf.length, 'bytes');
}

const lic = readFileSync(join(src, LICENSE.src));
check(LICENSE.src, lic, LICENSE.sha256);
writeFileSync(join(vendor, 'COPYING-classic-pool-game.txt'), lic);

for (const f of SPRITES) {
  const buf = readFileSync(join(src, f.src));
  check(f.src, buf, f.sha256);
  writeFileSync(join(sprOut, f.out), buf);
  console.log('wrote vendor/sprites/' + f.out + ' —', buf.length, 'bytes');
}

const bgPng = readFileSync(join(src, BG.src));
check(BG.src, bgPng, BG.sha256);
const bgJpg = join(sprOut, 'spr_background4.jpg');
execFileSync('convert', [join(src, BG.src), '-strip', '-quality', '82', bgJpg], { timeout: 30000 });
if (!existsSync(bgJpg)) throw new Error('convert did not write the table JPEG');
console.log('wrote vendor/sprites/spr_background4.jpg —', readFileSync(bgJpg).length, 'bytes (jpeg from table PNG)');

writeFileSync(join(vendor, 'UPSTREAM.txt'), [
  'Classic Pool Game by henshmi (Chen Shmilovich)',
  'https://github.com/henshmi/Classic-Pool-Game',
  'Pinned commit: ' + COMMIT,
  'License: MIT (see COPYING-classic-pool-game.txt)',
  '',
  'Vendored: the physics, 8-ball rules, stick, balls, AI trainer, and the',
  'table / ball / stick sprites. Menu PNGs, LAB.js, and the 9 MB jazz track',
  'are not shipped — the GifOS shell draws the menu, uses Web Audio, and',
  'adds touch plus two-device turns.',
  '',
].join('\n'));

if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('Classic-Pool-Game', COMMIT.slice(0, 10), '→ vendor/');
