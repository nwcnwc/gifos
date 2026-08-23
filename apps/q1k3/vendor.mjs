/*
 * vendor.mjs — rebuild vendor/ from the pinned upstream.
 *
 * This is the ONLY step that needs the network (and gcc, for the map
 * compiler). It is deliberately NOT part of build.mjs: the App GIF must
 * be buildable offline from what is committed here. Run this only to
 * move the pin.
 *
 *   node apps/q1k3/vendor.mjs
 *   Q1K3_SRC=/path/to/checkout node apps/q1k3/vendor.mjs
 *
 * WHAT IT PRODUCES.
 *   vendor/game.js     the original classic scripts, concatenated, fetch
 *                      patched out. Never edit; rerun this.
 *   vendor/assets.js   the packed maps (`l`) and models (`m`) as
 *                      Uint8Arrays. Same pin, no runtime fetch.
 *   vendor/COPYING-*.txt
 *
 * PHP is not required: pack_model.php is reimplemented below. The map
 * compiler stays C — it is TrenchBroom's .map format, and the original
 * tool is the source of truth for the bytes the renderer eats.
 */
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync,
  rmSync, existsSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const UPSTREAM = 'https://github.com/phoboslab/q1k3.git';
const PIN = '8ee934856c3f5de3c584724b9dd554314a911694'; // 2024-08-30 "Merge pull request #14 from irackson/fix_build"

const SOURCES = [
  'ttt.js',
  'audio.js',
  'math_utils.js',
  'model.js',
  'map.js',
  'renderer.js',
  'input.js',
  'weapons.js',
  'entity.js',
  'entity_player.js',
  'entity_light.js',
  'entity_torch.js',
  'entity_door.js',
  'entity_barrel.js',
  'entity_particle.js',
  'entity_projectile_grenade.js',
  'entity_projectile_nail.js',
  'entity_projectile_shell.js',
  'entity_projectile_plasma.js',
  'entity_projectile_gib.js',
  'entity_enemy.js',
  'entity_enemy_grunt.js',
  'entity_enemy_enforcer.js',
  'entity_enemy_ogre.js',
  'entity_enemy_zombie.js',
  'entity_enemy_hound.js',
  'entity_pickup.js',
  'entity_pickup_key.js',
  'entity_pickup_nailgun.js',
  'entity_pickup_grenadelauncher.js',
  'entity_pickup_health.js',
  'entity_pickup_nails.js',
  'entity_pickup_grenades.js',
  'entity_trigger_level.js',
  'textures.js',
  'music.js',
  'game.js',
  'main.js',
];

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 180000 });

let src = process.env.Q1K3_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'q1k3-'));
  src = join(tmp, 'q1k3');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) {
  throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');
}

const work = mkdtempSync(join(tmpdir(), 'q1k3-build-'));
const srcDir = join(src, 'source');

/* ---- pack models (pack_model.php, in JS) -------------------------------- */
function packModel(infiles, outfile) {
  const verts = [];
  const indices = [];
  let max = -Infinity;
  for (const file of infiles) {
    const text = readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = /^v (.*?) (.*?) (.*?)$/.exec(line);
      if (!m) continue;
      const v = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
      verts.push(v);
      max = Math.max(max, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
    }
  }
  const first = readFileSync(infiles[0], 'utf8');
  for (const line of first.split(/\r?\n/)) {
    const m = /^f (\d+).*?(\d+).*?(\d+).*?$/.exec(line);
    if (!m) continue;
    indices.push([parseInt(m[1], 10) - 1, parseInt(m[2], 10) - 1, parseInt(m[3], 10) - 1]);
  }
  const frames = infiles.length;
  const nverts = verts.length / frames;
  if (nverts !== (nverts | 0)) throw new Error('vertex count not divisible by frame count in ' + outfile);
  const buf = [];
  buf.push(frames, nverts, indices.length);
  for (const v of verts) {
    buf.push(
      Math.round((v[0] / max) * 15) + 15,
      Math.round((v[1] / max) * 15) + 15,
      Math.round((v[2] / max) * 15) + 15
    );
  }
  let aLast = 0;
  for (let i = 0; i < indices.length; i++) {
    const f = indices[i];
    const inc = f[0] - aLast;
    if (inc > 3) throw new Error('Face ' + i + ' index a increment exceeds 2 bits (' + inc + ') in ' + outfile);
    if (f[1] > 127 || f[2] > 127) throw new Error('Face ' + i + ' index exceeds 7 bits in ' + outfile);
    buf.push(inc, f[1], f[2]);
    aLast = f[0];
  }
  writeFileSync(outfile, Buffer.from(buf));
  console.log('wrote', outfile, frames, 'frame(s),', verts.length, 'verts,', indices.length, 'indices,', buf.length, 'bytes');
}

const models = join(src, 'assets', 'models');
packModel([join(models, 'boulder.obj')], join(work, 'boulder.rmf'));
packModel([join(models, 'q.obj')], join(work, 'q.rmf'));
packModel([join(models, 'grenade.obj')], join(work, 'grenade.rmf'));
packModel([join(models, 'hound_run_1.obj'), join(models, 'hound_run_2.obj')], join(work, 'hound.rmf'));
packModel([
  join(models, 'unit_idle.obj'),
  join(models, 'unit_run_1.obj'),
  join(models, 'unit_run_2.obj'),
  join(models, 'unit_run_3.obj'),
  join(models, 'unit_run_4.obj'),
  join(models, 'unit_fire.obj'),
], join(work, 'unit.rmf'));
packModel([join(models, 'box.obj')], join(work, 'box.rmf'));
packModel([join(models, 'nailgun.obj')], join(work, 'nailgun.rmf'));
packModel([
  join(models, 'torch_1.obj'),
  join(models, 'torch_2.obj'),
  join(models, 'torch_3.obj'),
], join(work, 'torch.rmf'));

const mBin = Buffer.concat([
  'boulder', 'unit', 'grenade', 'q', 'hound', 'box', 'nailgun', 'torch'
].map((n) => readFileSync(join(work, n + '.rmf'))));

/* ---- pack maps (original C compiler) ------------------------------------ */
const packMap = join(work, 'pack_map');
execFileSync('gcc', ['-std=gnu99', join(src, 'pack_map.c'), '-lm', '-o', packMap], {
  stdio: 'inherit', timeout: 60000
});
run(packMap, [join(src, 'assets', 'maps', 'm1.map'), join(work, 'm1.plb')], work);
run(packMap, [join(src, 'assets', 'maps', 'm2.map'), join(work, 'm2.plb')], work);
const lBin = Buffer.concat([
  readFileSync(join(work, 'm1.plb')),
  readFileSync(join(work, 'm2.plb')),
]);

/* ---- patch sources, concat ---------------------------------------------- */
function patch(file, find, replace, why) {
  const f = join(srcDir, file);
  const before = readFileSync(f, 'utf8');
  if (!find.test(before)) {
    throw new Error('PATCH NO LONGER APPLIES: ' + file + ' — ' + why
      + '\n  Upstream moved this code. Re-target the patch or drop it DELIBERATELY;'
      + '\n  building without it silently loses what it was for.');
  }
  writeFileSync(f, before.replace(find, replace));
  console.log('patched ' + file + ' — ' + why);
}

patch(
  'map.js',
  /let data = new Uint8Array\(await \(await fetch\(path\)\)\.arrayBuffer\(\)\),/,
  'let data = Q1K3_MAP,',
  'maps ride inside the GIF; the sandbox has no fetch'
);
patch(
  'model.js',
  /let data = new Uint8Array\(await \(await fetch\(path\)\)\.arrayBuffer\(\)\),/,
  'let data = Q1K3_MODELS,',
  'models ride inside the GIF; the sandbox has no fetch'
);
patch(
  'main.js',
  /^game_load\(\);/m,
  'window.q1k3_ready = game_load();',
  'boot.js starts the load after the canvas and the gate exist'
);

let game = '';
for (const s of SOURCES) {
  const f = join(srcDir, s);
  if (!existsSync(f)) throw new Error('upstream is missing source/' + s);
  game += '\n/* ---- ' + s + ' ---- */\n' + readFileSync(f, 'utf8');
}
if (/<\/script/i.test(game)) throw new Error('concatenated game.js contains </script — cannot inline safely');
if (/\bfetch\s*\(/.test(game)) throw new Error('game.js still contains fetch( after the patches');

const out = join(dir, 'vendor');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'game.js'), game);

function b64module(name, buf) {
  const b64 = buf.toString('base64');
  return '(function(){\n'
    + 'var b=atob(' + JSON.stringify(b64) + '),u=new Uint8Array(b.length);\n'
    + 'for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);\n'
    + 'window.' + name + '=u;\n'
    + '})();\n';
}
const assets = b64module('Q1K3_MAP', lBin) + b64module('Q1K3_MODELS', mBin);
if (/<\/script/i.test(assets)) throw new Error('assets.js contains </script');
writeFileSync(join(out, 'assets.js'), assets);

copyFileSync(join(src, 'LICENSE.md'), join(out, 'COPYING-q1k3.txt'));

const sonant = `zlib License

Copyright (c) 2014 Nicolas Vanhoren
Copyright (c) 2011 Marcus Geelnard
Copyright (c) 2008-2009 Jake Taylor

This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
   claim that you wrote the original software. If you use this software
   in a product, an acknowledgment in the product documentation would be
   appreciated but is not required.

2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.

3. This notice may not be removed or altered from any source
   distribution.

Q1K3 ships a heavily modified Sonant-X (js-sonant) for sounds and music.
The notice is taken from source/audio.js of phoboslab/q1k3.
`;
writeFileSync(join(out, 'COPYING-sonant-x.txt'), sonant);

writeFileSync(join(out, 'UPSTREAM.txt'),
  'vendor/game.js and vendor/assets.js are GENERATED. Do not edit them;\n'
  + 'run node apps/q1k3/vendor.mjs.\n\n'
  + 'upstream: ' + UPSTREAM.replace(/\.git$/, '') + '\n'
  + 'commit:   ' + PIN + '\n'
  + 'license:  MIT (COPYING-q1k3.txt); Sonant-X zlib (COPYING-sonant-x.txt)\n'
  + 'music:    Andy Lösch, no-fate.net (sonant data in source/music.js)\n\n'
  + 'game.js is the uncompressed classic-script sources concatenated in the\n'
  + 'order index.html listed them, minus document.js (the GifOS shell owns\n'
  + 'the page). fetch() of build/l and build/m is patched to read Q1K3_MAP\n'
  + 'and Q1K3_MODELS from assets.js, because a GIF srcdoc cannot fetch.\n'
  + 'assets.js is the packed maps and models the original build.sh produced\n'
  + '(pack_map.c + pack_model.php, the latter reimplemented in this file).\n'
  + 'Both notices travel INSIDE the GIF as well as beside it here.\n'
);

console.log('wrote vendor/game.js —', (game.length / 1024).toFixed(0), 'KB from', SOURCES.length, 'files');
console.log('wrote vendor/assets.js — maps', lBin.length, 'B, models', mBin.length, 'B');

rmSync(work, { recursive: true, force: true });
if (tmp) rmSync(tmp, { recursive: true, force: true });
