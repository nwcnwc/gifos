/*
 * vendor.mjs — rebuild vendor/cube.js from the pinned upstream.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/nxn-cube/vendor.mjs
 *   CUBE_SRC=/path/to/checkout node apps/nxn-cube/vendor.mjs
 *
 * WHAT IT PRODUCES. One IIFE bundle exposing `NXN.Rubiks` — upstream's cube
 * and the slice of three.js it uses, minified. GifOS's runtime inlines
 * <script src> by rewriting the tag, which DROPS type="module"
 * (buildAppHtml in site/js/runtime.js), so ES module semantics do not survive
 * the trip into an app. One classic IIFE does.
 *
 * The GifOS layer (boot.js, the race) is ordinary source and is never compiled
 * in. Overlay files in gifos/ are copied onto the checkout before the bundle:
 * pointer-event controls, a seeded scramble (upstream's disorder() is empty),
 * no CDN logo, no localStorage.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const UPSTREAM = 'https://github.com/pengfeiw/rubiks-cube.git';
const PIN = 'c30b46d057c7b52b3db4feea3f881174c2bdbd44'; // 2022-07-16 "add MIT license"

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 900000 });

let src = process.env.CUBE_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'nxn-cube-'));
  src = join(tmp, 'rubiks-cube');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) {
  throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');
}

if (!existsSync(join(src, 'node_modules', 'three'))) {
  console.log('npm install (upstream)…');
  run('npm', ['install', '--no-audit', '--no-fund'], src);
}

const overlay = join(dir, 'gifos');
const copies = [
  ['facade.ts', 'src/_gifos-facade.ts'],
  ['index.ts', 'src/rubiks/index.ts'],
  ['control.ts', 'src/rubiks/core/control.ts'],
  ['cube.ts', 'src/rubiks/core/cube.ts'],
  ['cubeData.ts', 'src/rubiks/core/cubeData.ts'],
  ['square.ts', 'src/rubiks/core/square.ts'],
  ['statusbar.ts', 'src/rubiks/core/statusbar.ts'],
];
for (const [from, to] of copies) {
  const srcPath = join(overlay, from);
  if (!existsSync(srcPath)) throw new Error('missing overlay ' + from);
  copyFileSync(srcPath, join(src, to));
  console.log('overlay ' + to);
}

if (!existsSync(join(src, 'node_modules', 'esbuild'))) {
  console.log('npm install esbuild (bundle only)…');
  run('npm', ['install', '--no-save', '--no-audit', '--no-fund', 'esbuild@0.21.5'], src);
}

const outJs = join(dir, 'vendor', 'cube.js');
mkdirSync(join(dir, 'vendor'), { recursive: true });
const esbuild = join(src, 'node_modules', 'esbuild', 'bin', 'esbuild');
run(esbuild, [
  'src/_gifos-facade.ts',
  '--bundle',
  '--format=iife',
  '--global-name=NXN',
  '--outfile=' + outJs,
  '--minify',
  '--legal-comments=none',
  '--target=es2018',
], src);

const bundle = readFileSync(outJs, 'utf8');
if (/<\/script/i.test(bundle)) throw new Error('bundle contains </script — cannot inline safely.');
if (!/\bNXN\b/.test(bundle)) throw new Error('bundle does not define NXN.');
if (/^\s*export\s|import\.meta/m.test(bundle)) {
  throw new Error('bundle still has ESM syntax — the classic-script inline path cannot carry it.');
}

copyFileSync(join(src, 'LICENSE'), join(dir, 'vendor', 'COPYING-rubiks-cube.txt'));
copyFileSync(join(src, 'node_modules', 'three', 'LICENSE'), join(dir, 'vendor', 'COPYING-three.txt'));

const three = JSON.parse(readFileSync(join(src, 'node_modules', 'three', 'package.json'), 'utf8')).version;
writeFileSync(join(dir, 'vendor', 'UPSTREAM.txt'),
  'vendor/cube.js is GENERATED. Do not edit it; run node apps/nxn-cube/vendor.mjs.\n\n' +
  'upstream: ' + UPSTREAM + '\n' +
  'commit:   ' + PIN + '\n' +
  'three:    ' + three + '\n' +
  'entry:    src/_gifos-facade.ts (from gifos/facade.ts), IIFE, global NXN\n\n' +
  'Both licences are MIT and travel beside it as COPYING-rubiks-cube.txt and\n' +
  'COPYING-three.txt. They are packed into the GIF too, so a copy of this app\n' +
  'that someone was handed still carries the notices it is required to carry.\n');

const bytes = readFileSync(outJs).length;
console.log('wrote apps/nxn-cube/vendor/cube.js — ' + (bytes / 1024).toFixed(0) + ' KB from ' + PIN.slice(0, 10));
if (tmp) rmSync(tmp, { recursive: true, force: true });
