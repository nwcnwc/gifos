/*
 * vendor.mjs — rebuild vendor/game.js from the pinned upstream.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline and byte-reproducible from
 * what is committed here, the same way the App Store catalog and run.html's
 * browser table are generated-but-committed. Run this only to move the pin.
 *
 *   node apps/fps-simple/vendor.mjs                    # clone the pin and build
 *   COD_SRC=/path/to/checkout node apps/fps-simple/vendor.mjs   # reuse a clone
 *
 * WHAT IT PRODUCES. One IIFE bundle exposing `window.COD` — upstream's engine
 * and systems, plus the slice of three.js they use, minified. Nothing else: the
 * GifOS layer (boot, touch controls, netplay) is ORDINARY SOURCE in this
 * directory and is never compiled in, so it stays readable and editable by
 * anyone with a text editor and no toolchain. That split is the whole point.
 *
 * WHY A BUNDLE AND NOT THE TREE. Upstream is 142 ES modules that import each
 * other and `three` by bare specifier. GifOS's runtime inlines <script src> by
 * rewriting the tag, which DROPS type="module" (see buildAppHtml in
 * site/js/runtime.js), so ES module semantics do not survive the trip into an
 * app. One classic IIFE script does, and it is also what keeps the GIF small.
 *
 * NO TOP-LEVEL AWAIT. Upstream's own src/main.js has TLA and cannot be built as
 * an IIFE at all ("Module format iife does not support top-level await"). We do
 * not use it — boot.js in this directory is our entry, and it awaits inside an
 * async function like a civilised person. main.js is also full of capture-
 * harness machinery (?capture, ?lockstep, window.__PUMP__) that has no meaning
 * inside a GIF.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

// The pin. Moving it is a deliberate act: bump both, rerun this, and re-run the
// suites — upstream is a game engine under active development, not a library
// with a compatibility promise.
const UPSTREAM = 'https://github.com/mshumer/Claude-of-Duty.git';
const PIN = 'd9b237b75c9304ab8d9ef4cfa0c3568c7c11a853'; // 2026-07-25 "Add updates link to README"

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 900000 });

let src = process.env.COD_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'cod-'));
  src = join(tmp, 'cod');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately, do not build off whatever is lying around.');

if (!existsSync(join(src, 'node_modules', 'three'))) run('npm', ['install', '--silent'], src);

// PATCHES WE CARRY, applied to upstream's SOURCE before the build.
//
// The engine is MIT and vendored, so changing it is allowed — what is not
// allowed is changing it invisibly. A hand-edit to vendor/game.js disappears
// the next time anybody moves the pin, and nobody finds out until the thing it
// fixed comes back. So every change lives here, is applied to the checkout, and
// FAILS THE BUILD if upstream has moved the code out from under it. A patch
// that no longer matches is a decision to make, not a line to skip.
//
// aiTexSize / aiCamo — AiSystem hardcodes `size: 512` and three camo sets, with
// no path from the quality preset. Measured on a Moto g24 that is 8.4 s of a
// 21 s first load, and it is the single largest item left. Making both readable
// from config.q lets a weak device ask for smaller maps and one camo without
// touching what a fast device gets.
const PATCHES = [
  {
    file: 'src/ai/index.js',
    find: /size:\s*512,\s*anisotropy:\s*([A-Za-z_$][\w$]*)\.config\.q\.anisotropy\s*\?\?\s*8,\s*camo:\s*\[\s*['"]arid['"],\s*['"]woodland['"],\s*['"]urban['"]\s*\]/,
    replace: (m, t) => `size: ${t}.config.q.aiTexSize ?? 512, anisotropy: ${t}.config.q.anisotropy ?? 8, camo: ${t}.config.q.aiCamo ?? ['arid', 'woodland', 'urban']`,
    why: 'let a weak device pick smaller camo maps and fewer of them',
  },
  {
    // WeaponSystem builds every viewmodel up front — three of them, 136.8k
    // triangles, 4.4 s of a 16 s first load on a Moto g24. The list is
    // hardcoded, so a device that would rather start than carry a spare cannot
    // say so. Configurable, defaulting to exactly what upstream does.
    file: 'src/weapons/index.js',
    find: /for\s*\(\s*const\s+([A-Za-z_$][\w$]*)\s+of\s*\[\s*['"]rifle['"],\s*['"]smg['"],\s*['"]pistol['"]\s*\]\s*\)/,
    replace: (m, n) => `for (const ${n} of (t.config.q.weapons ?? ['rifle', 'smg', 'pistol']))`,
    why: 'let a weak device build fewer weapon viewmodels at boot',
  },
  {
    // FxSystem picks its particle atlas size from the particle budget alone —
    // 512 px unless the budget is huge. A phone wants a smaller one for the
    // same reason it wants smaller everything else, and 939 ms of a 15 s boot
    // is worth not spending on sparks nobody has seen yet.
    file: 'src/fx/index.js',
    find: /=\s*([A-Za-z_$][\w$]*)\s*\?\s*1024\s*:\s*512\s*;/,
    replace: (m, big) => `= e.fxAtlas ?? (${big} ? 1024 : 512);`,
    why: 'let a weak device bake smaller particle atlases',
  },
];
for (const p of PATCHES) {
  const f = join(src, p.file);
  const before = readFileSync(f, 'utf8');
  if (!p.find.test(before)) {
    throw new Error('PATCH NO LONGER APPLIES: ' + p.file + ' — ' + p.why
      + '\n  Upstream moved this code. Re-target the patch or drop it DELIBERATELY;'
      + '\n  building without it silently loses what it was for.');
  }
  writeFileSync(f, before.replace(p.find, p.replace));
  console.log('patched ' + p.file + ' — ' + p.why);
}

// The facade. Everything our layer needs, and nothing it does not — a smaller
// surface here is a smaller thing to keep working when the pin moves.
writeFileSync(join(src, 'src', '_gifos-facade.js'), `
export * as THREE from 'three';
export { Engine } from './core/engine.js';
export { createConfig } from './core/config.js';
export { Rng } from './core/rng.js';
export { prewarm } from './core/prewarm.js';
export { RenderSystem } from './render/index.js';
export { MaterialSystem } from './materials/index.js';
export { SkySystem } from './sky/index.js';
export { WorldSystem } from './world/index.js';
export { PhysicsSystem } from './physics/index.js';
export { PlayerSystem } from './player/index.js';
export { WeaponSystem } from './weapons/index.js';
export { FxSystem } from './fx/index.js';
export { AiSystem } from './ai/index.js';
export { UiSystem } from './ui/index.js';
export { AudioSystem } from './audio/index.js';
`);

writeFileSync(join(src, 'vite.gifos.config.js'), `
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    target: 'es2022', sourcemap: false, minify: 'esbuild', outDir: 'dist-gifos', emptyOutDir: true,
    lib: { entry: 'src/_gifos-facade.js', name: 'COD', formats: ['iife'], fileName: () => 'game.js' },
  },
});
`);
run('npx', ['vite', 'build', '-c', 'vite.gifos.config.js'], src);

mkdirSync(join(dir, 'vendor'), { recursive: true });
copyFileSync(join(src, 'dist-gifos', 'game.js'), join(dir, 'vendor', 'game.js'));
copyFileSync(join(src, 'LICENSE'), join(dir, 'vendor', 'COPYING-claude-of-duty.txt'));
copyFileSync(join(src, 'node_modules', 'three', 'LICENSE'), join(dir, 'vendor', 'COPYING-three.txt'));

const three = JSON.parse(readFileSync(join(src, 'node_modules', 'three', 'package.json'), 'utf8')).version;
writeFileSync(join(dir, 'vendor', 'UPSTREAM.txt'),
  'vendor/game.js is GENERATED. Do not edit it; run node apps/fps-simple/vendor.mjs.\n\n' +
  'upstream: ' + UPSTREAM + '\n' +
  'commit:   ' + PIN + '\n' +
  'three:    ' + three + '\n' +
  'entry:    src/_gifos-facade.js (written by vendor.mjs), IIFE, global COD\n\n' +
  'Both licences are MIT and travel beside it as COPYING-claude-of-duty.txt and\n' +
  'COPYING-three.txt. They are packed into the GIF too, so a copy of this app\n' +
  'that someone was handed still carries the notices it is required to carry.\n');

const bytes = readFileSync(join(dir, 'vendor', 'game.js')).length;
console.log('wrote apps/fps-simple/vendor/game.js — ' + (bytes / 1024 / 1024).toFixed(2) + ' MB from ' + PIN.slice(0, 10));
if (tmp) rmSync(tmp, { recursive: true, force: true });
