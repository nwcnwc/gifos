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
// THEY ARE APPLIED TO THE SOURCE, SO THEY MUST BE WRITTEN AGAINST THE SOURCE.
// Three of the patches below were originally written against the MINIFIED
// bundle, because that is where the fix was first made by hand — they carried
// esbuild's variable names (`t`, `e`) and esbuild's comma-joined declarations
// into a `.replace()` aimed at upstream's own files. The result: one of them
// stopped matching and killed the build, and two of them matched and produced
// code that referenced identifiers that do not exist in the source, so the
// rebuilt engine died at boot with "e is not defined". Patch the bundle by hand
// for a quick look if you must, but the entry here has to be the SOURCE edit,
// and `node vendor.mjs` is the only thing that proves it.
//
// Two families live here:
//
//   BUDGET KNOBS — aiTexSize/aiCamo, weapons, fxAtlas. Sizes and lists upstream
//   hardcodes, with no path from the quality preset, so a weak device cannot
//   ask for less. Each defaults to exactly what upstream does.
//
//   CACHE HOOKS — weaponModel/weaponAsm, aiNav, aiVariant and their onX twins.
//   Everything in this game is generated at boot from one seed and comes out
//   identical every time; these are the seams where a built thing can be handed
//   back in, or handed out to be kept. See meshcache.js. Each defaults to
//   upstream's exact behaviour when the hook is absent, which is what makes
//   them safe to carry.
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
    // `this.ctx.config.q`, NOT `ctx.config.q`. This patch used to write a bare
    // `t.config.q` — the name the CONTEXT has in the minified bundle, where the
    // fix was first made by hand. Applied to upstream's SOURCE, where init's
    // parameter is `ctx`, that is a ReferenceError on the first weapon and the
    // game never starts. `this.ctx` is assigned on init's first line and is the
    // same object under both names, so it survives the minifier and the source
    // alike.
    replace: (m, n) => `for (const ${n} of (this.ctx.config.q.weapons ?? ['rifle', 'smg', 'pistol']))`,
    why: 'let a weak device build fewer weapon viewmodels at boot',
  },
  {
    // FxSystem picks its particle atlas size from the particle budget alone —
    // 512 px unless the budget is huge. A phone wants a smaller one for the
    // same reason it wants smaller everything else, and 939 ms of a 15 s boot
    // is worth not spending on sparks nobody has seen yet.
    file: 'src/fx/index.js',
    find: /=\s*([A-Za-z_$][\w$]*)\s*\?\s*1024\s*:\s*512\s*([;,])/,
    // `this.ctx.config.q`, for the same reason as the weapons patches: this
    // used to read a bare `e`, which is what the MINIFIER called the local
    // alias for config.q in the bundle somebody hand-edited. Against upstream's
    // source there is no `e`, so the rebuilt engine threw "e is not defined"
    // during fx init and the game did not start at all. `this.ctx` is assigned
    // on init's first line and means the same thing under every name.
    replace: (m, big, end) => `= this.ctx.config.q.fxAtlas ?? (${big} ? 1024 : 512)${end}`,
    why: 'let a weak device bake smaller particle atlases',
  },
  {
    // The weapon viewmodels are generated from code every launch — 136.8k
    // triangles, 2.6 s on a Moto g24, and bit-for-bit identical every time
    // because nothing about them varies. There was no way to hand one in or to
    // see one come out. Two hooks: supply a model and it is used, or watch what
    // was built so it can be kept. Both default to nothing, so upstream's
    // behaviour is exactly unchanged when neither is set.
    //
    // RETARGETED. The first version of this regex expected
    // `const m = builders[id](), entry = this.viewmodel.addWeapon(m, def)` —
    // ONE comma-joined declaration, which is what esbuild emits and what was
    // hand-edited into the bundle. Upstream's source has two separate `const`
    // statements, so the patch never matched it and `node vendor.mjs` died on
    // this entry: the pin could not be rebuilt at all. It now accepts either
    // shape, and the build proves it.
    file: 'src/weapons/index.js',
    find: /const\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\[([A-Za-z_$][\w$]*)\]\(\)\s*[;,]\s*(?:const\s+)?([A-Za-z_$][\w$]*)\s*=\s*this\.viewmodel\.addWeapon\(\1\s*,\s*([A-Za-z_$][\w$]*)\)/,
    replace: (m, r, table, name, c, def) =>
      `const ${r} = (this.ctx.config.q.weaponModel && this.ctx.config.q.weaponModel(${name})) || ${table}[${name}]();\n`
      + `      this.ctx.config.q.onWeaponModel && this.ctx.config.q.onWeaponModel(${name}, ${r});\n`
      + `      const ${c} = this.viewmodel.addWeapon(${r}, ${def})`,
    why: 'let built weapon models be cached and handed back',
  },
  {
    // WHERE THE WEAPON'S TIME ACTUALLY GOES. The model handed round by the hook
    // above is a plain descriptor — assemblies of loose, untransformed geometry
    // pieces plus a table of anchor points. Merging those buckets
    // (mergeGeometries + mergeVertices) and then baking curvature masks into
    // every vertex is what costs 960 ms for a single rifle on a SwiftShader
    // fleet box, and it happens HERE, inside addWeapon, not in the builder.
    //
    // So the seam is one level down: ask for this assembly's finished, merged
    // geometry before building it. Absent the hook, `asm.build()` runs exactly
    // as before.
    file: 'src/weapons/viewmodel.js',
    find: /const build = \(asm, parent, wearScale = 1\) => \{\s*\n\s*const map = asm\.build\(\);/,
    replace: () =>
      'const build = (asm, parent, wearScale = 1) => {\n'
      + '      const _gq = this.ctx.config.q;\n'
      + '      const _gcached = _gq.weaponAsm ? _gq.weaponAsm(model.id, asm.name) : null;\n'
      + '      const map = _gcached || asm.build();',
    why: 'let a merged, mask-baked viewmodel assembly be handed in',
  },
  {
    // A restored assembly ALREADY HAS its masks baked in — they are vertex data
    // and they travelled with the geometry. Baking them a second time would
    // shape an already-shaped ramp (wear^2.8 applied twice), so the gun would
    // come back visibly cleaner than the one it was built from, and it would
    // cost the same milliseconds this whole thing exists to save.
    file: 'src/weapons/viewmodel.js',
    find: /^(\s*)if \(bake\) \{$/m,
    replace: (m, sp) => `${sp}if (bake && !_gcached) {`,
    why: 'do not re-bake curvature masks into geometry that already carries them',
  },
  {
    // …and the other half: hand back what was built, AFTER the bake, so what is
    // kept is the finished article rather than the loose pieces.
    file: 'src/weapons/viewmodel.js',
    find: /^(\s*)const mesh = new THREE\.Mesh\(geo, this\.mats\.get\(matKey\)\);$/m,
    replace: (m, sp) =>
      `${sp}if (!_gcached && _gq.onWeaponAsm) _gq.onWeaponAsm(model.id, asm.name, matKey, geo);\n`
      + `${sp}const mesh = new THREE.Mesh(geo, this.mats.get(matKey));`,
    why: 'let a merged, mask-baked viewmodel assembly be kept',
  },
  {
    // THE NAVIGATION GRID IS DATA, NOT GEOMETRY, and it is the cheapest thing
    // here to keep: 221x221 cells cost 482 ms of ray casts into the physics BVH
    // on a fleet box and come out as three typed arrays and 1353 plain points —
    // about 340 KB. It is a pure function of the static collision world, which
    // is a pure function of the engine bundle and the seed.
    //
    // The grid and the cover map are still CONSTRUCTED either way (that is
    // where nx/nz/minX/minZ and the A* scratch come from); only the two build()
    // passes are skipped, and only when the hook says it filled them in.
    file: 'src/ai/index.js',
    find: /(this\.grid = new NavGrid\(phys, \{ bounds, cell: 0\.8, radius: 0\.36, height: 1\.78 \}\);)\s*\n\s*this\.grid\.build\(\);\s*\n\s*(this\.cover = new CoverMap\(this\.grid, phys\);)\s*\n\s*this\.cover\.build\(\{ step: 1, reach: 1\.3 \}\);/,
    replace: (m, mkGrid, mkCover) =>
      `${mkGrid}\n    ${mkCover}\n`
      + '    const _gq = this.ctx.config.q;\n'
      + '    if (!(_gq.aiNav && _gq.aiNav(this.grid, this.cover))) {\n'
      + '      this.grid.build();\n'
      + '      this.cover.build({ step: 1, reach: 1.3 });\n'
      + '      _gq.onAiNav && _gq.onAiNav(this.grid, this.cover);\n'
      + '    }',
    why: 'let the walkability grid and cover points be kept between launches',
  },
  {
    // A soldier variant is one skinned geometry stitched from a hundred parts —
    // 221/136/143 ms for the three of them on a fleet box, every launch, and
    // identical every time. The hook hands back the GEOMETRY and the plain data
    // beside it; the MATERIALS are rebuilt here by upstream's own
    // resolveMaterials(), because they are procedural camo maps with runtime-
    // patched shaders and a serialised one would draw untextured.
    //
    // The slot list resolveMaterials needs is recovered from the part table:
    // CharacterBuilder emits parts sorted by material, so the materials in
    // order of first appearance ARE the slot order it grouped by.
    //
    // `this.rng.fork()` is drawn on BOTH paths. Skipping it would shift every
    // later fork in this system's stream, so the agents spawned after a cache
    // hit would be animated differently from the ones after a miss.
    file: 'src/ai/index.js',
    find: /^(\s*)v = buildSoldier\(name, \{ rng: this\.rng\.fork\(\), materials: this\.materials \}\);$/m,
    replace: (m, sp) =>
      `${sp}const _grng = this.rng.fork();\n`
      + `${sp}const _gq = this.ctx.config.q;\n`
      + `${sp}const _gc = _gq.aiVariant ? _gq.aiVariant(name) : null;\n`
      + `${sp}if (_gc) {\n`
      + `${sp}  const _gslots = [];\n`
      + `${sp}  for (const _gp of _gc.parts) if (!_gslots.includes(_gp.material)) _gslots.push(_gp.material);\n`
      + `${sp}  v = { geometry: _gc.geometry, materials: resolveMaterials(name, _gslots, this.materials),\n`
      + `${sp}        parts: _gc.parts, weapon: _gc.weapon, stats: _gc.stats,\n`
      + `${sp}        variant: VARIANTS[name] ?? VARIANTS.vanguard };\n`
      + `${sp}} else {\n`
      + `${sp}  v = buildSoldier(name, { rng: _grng, materials: this.materials });\n`
      + `${sp}  _gq.onAiVariant && _gq.onAiVariant(name, v);\n`
      + `${sp}}`,
    why: 'let a built soldier variant be kept between launches',
  },
  {
    // A TEN MINUTE GAME GETS WORSE THE LONGER IT RUNS, and this is why. The
    // fixed step is 1/120 s with up to EIGHT substeps a frame, so at 30 fps
    // every frame runs four substeps of character sweeps against a 37.6k-tri
    // BVH — and a slow frame earns itself MORE substeps, which slows the next
    // one. Measured over a session: f:physics went from 0.61 ms/frame at two
    // minutes to 9.05 ms/frame at four, with single frames at 85, 102, 117 ms.
    // That is a feedback loop, not a load. Both numbers become config so a weak
    // device can ask for a step it can actually keep up with; unset, upstream's
    // 1/120 and 8 are used exactly as before.
    file: 'src/core/engine.js',
    find: /this\._accum\s*>=\s*([A-Za-z_$][\w$]*)\s*&&\s*([A-Za-z_$][\w$]*)\s*<\s*([A-Za-z_$][\w$]*)/,
    replace: (m, step, i, cap) =>
      `this._accum >= (this.ctx.config.q.fixedStep || ${step}) && ${i} < (this.ctx.config.q.maxSubsteps || ${cap})`,
    why: 'let a weak device widen the physics step instead of spiralling',
  },
  {
    // The HUD is laid out for 1080p and scales by viewport height, with a floor
    // of 0.62 — so on a phone, or any modest window, every number and label is
    // drawn at 62% of a size chosen for a desktop monitor. Reported from across
    // the room as "font size for ants". The floor becomes config; unset, it is
    // upstream's 0.62.
    file: 'src/ui/index.js',
    find: /this\.k\s*=\s*([A-Za-z_$][\w$]*)\(\s*([A-Za-z_$][\w$]*)\s*\/\s*1080\s*,\s*\.?62\s*,\s*2\.4\s*\)/,
    replace: (m, clamp, h) =>
      `this.k = ${clamp}(${h} / 1080, (this.ctx && this.ctx.config && this.ctx.config.q.hudMinScale) || 0.62, 2.4)`,
    why: 'let the HUD stay readable on a phone instead of flooring at 62%',
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
