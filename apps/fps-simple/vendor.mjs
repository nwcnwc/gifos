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
    // AND WHY THE FIRST VERSION OF THIS PATCH DID NOT FIX IT. It rewrote only
    // the loop CONDITION, leaving the body stepping and draining by FIXED_DT:
    //
    //     while (accum >= (q.fixedStep || FIXED_DT) && steps < (q.maxSubsteps || MAX_SUBSTEPS)) {
    //       for (…) sys.fixedUpdate(FIXED_DT, ctx);   // still 1/120
    //       accum -= FIXED_DT;                        // still 1/120
    //     }
    //     if (steps === MAX_SUBSTEPS) accum = 0;      // 3 === 8, never
    //
    // So the configured step was a lie — the simulation still advanced 1/120 a
    // substep, doing exactly as much work per simulated second as before — and,
    // worse, the spiral guard was DISABLED for any device that configured a cap,
    // because it compares against upstream's constant 8 and steps now tops out
    // at 3. The accumulator was therefore never shed: on the phone, at 200 ms a
    // frame, it grows ~0.175 s EVERY FRAME, forever, so every frame runs the cap
    // and the simulation falls permanently behind the wall clock.
    //
    // The whole block is rewritten so the configured step is the step: the loop
    // gates on it, fixedUpdate receives it, the accumulator drains by it, the
    // guard compares against the configured cap, and alpha is a fraction of it.
    // Unset, every one of those is upstream's own value and this is a no-op.
    file: 'src/core/engine.js',
    // The same rewrite also TIMES the frame, because there is no other way to
    // learn where a phone's 200 ms goes: this device takes no debugger, and a
    // profiler on a desktop measures a desktop. Four timestamps a frame,
    // accumulated into ctx.__phase for framelog.js to publish and reset. It
    // costs four performance.now() calls and answers the only question left.
    find: /this\._accum \+= t\.dt;[\s\S]*?this\.input\.endFrame\(\);/,
    replace: () => [
      'this._accum += t.dt;',
      '    let steps = 0;',
      '    const fixedSystems = this.registry.with(\'fixedUpdate\');',
      '    const _P = this.ctx.__phase || (this.ctx.__phase = { fixed: 0, update: 0, late: 0, render: 0, steps: 0, n: 0 });',
      '    const _t0 = performance.now();',
      '    const _step = this.ctx.config.q.fixedStep || FIXED_DT;',
      '    const _cap = this.ctx.config.q.maxSubsteps || MAX_SUBSTEPS;',
      '    while (this._accum >= _step && steps < _cap) {',
      '      for (const sys of fixedSystems) sys.fixedUpdate(_step, this.ctx);',
      '      this._accum -= _step;',
      '      steps++;',
      '    }',
      '    if (steps === _cap) this._accum = 0; // shed backlog rather than spiral',
      '    t.alpha = this._accum / _step;',
      '    const _t1 = performance.now();',
      '',
      '    for (const sys of this.registry.with(\'update\')) sys.update(t.dt, this.ctx);',
      '    const _t2 = performance.now();',
      '    for (const sys of this.registry.with(\'lateUpdate\')) sys.lateUpdate(t.dt, this.ctx);',
      '    const _t3 = performance.now();',
      '',
      '    const renderSystem = this.registry.peek(\'render\');',
      '    if (typeof renderSystem?.render === \'function\') renderSystem.render(this.ctx);',
      '    const _t4 = performance.now();',
      '    _P.fixed += _t1 - _t0; _P.update += _t2 - _t1; _P.late += _t3 - _t2;',
      '    _P.render += _t4 - _t3; _P.steps += steps; _P.n++;',
      '',
      '    this.input.endFrame();',
    ].join('\n'),
    why: 'let a weak device widen the physics step instead of spiralling, and say where the frame went',
  },
  {
    // The HUD is laid out for 1080p and scales by viewport height, with a floor
    // of 0.62 — so on a phone, or any modest window, every number and label is
    // drawn at 62% of a size chosen for a desktop monitor. Reported from across
    // the room as "font size for ants". The floor becomes config; unset, it is
    // upstream's 0.62.
    file: 'src/ui/index.js',
    // `0?\.62`, not `\.?62`. Upstream writes `clamp(h / 1080, 0.62, 2.4)` and
    // the old pattern could match `.62` or `62` but never `0.62`, so a build
    // from a CLEAN clone died here — the patch only ever applied to a checkout
    // something had already been done to. Exactly the rot the fail-loud rule
    // above exists to catch, caught by it.
    find: /this\.k\s*=\s*([A-Za-z_$][\w$]*)\(\s*([A-Za-z_$][\w$]*)\s*\/\s*1080\s*,\s*0?\.62\s*,\s*2\.4\s*\)/,
    replace: (m, clamp, h) =>
      `this.k = ${clamp}(${h} / 1080, (this.ctx && this.ctx.config && this.ctx.config.q.hudMinScale) || 0.62, 2.4)`,
    why: 'let the HUD stay readable on a phone instead of flooring at 62%',
  },
  {
    // THE MOTO DREW THE WHOLE GAME AND MULTIPLIED IT BY ZERO.
    //
    // On the phone the viewport was black under a live HUD, while the identical
    // build rendered a sunlit street on a desktop. Everything a counter can
    // reach was healthy: 450 draw calls, 3.4M triangles, 237 shader programs
    // with none bad, every render target framebuffer-COMPLETE, half-float
    // supported, no GL error, and the same lights at the same intensities.
    //
    // AutoExposure builds its metering chain — 64,16,4,1 and two 1x1 adapt
    // targets — by handing hdrTarget() a type override of FloatType. It does
    // not override the FILTERS, and hdrTarget defaults to LinearFilter on both.
    // A full-float texture with linear filtering is INCOMPLETE unless
    // OES_texture_float_linear is present, and on this Mali-G52 it is not
    // (measured on the device: cbf:1 cbhf:1 tfl:0 — half-float is filterable,
    // full float is not). Sampling an incomplete texture is not an error; it
    // silently returns (0,0,0,1). composite.js then does:
    //
    //     float exposure = texture2D( tExposure, vec2( 0.5 ) ).r * uLook.w;
    //     hdr *= exposure;
    //
    // so the exposure it reads is 0 and the finished frame is multiplied to
    // black. Every stage upstream of it worked perfectly, which is exactly why
    // this took a pixel readback on the device to find rather than a counter.
    //
    // Half-float is the fix rather than NearestFilter because the 64->16->4->1
    // chain is a box downsample and WANTS linear filtering; and it is what
    // every other HDR target in this engine already uses. Its range (65504)
    // and precision are far beyond what a log-luminance meter and a clamped
    // EV value in [-4, 16] need. On a device that CAN filter full float this
    // changes the metering by nothing anyone can see.
    file: 'src/render/exposure.js',
    find: /const\s+([A-Za-z_$][\w$]*)\s*=\s*\{\s*type:\s*THREE\.FloatType,\s*format:\s*THREE\.RGBAFormat,\s*name:\s*['"]exposure['"]\s*\}/,
    replace: (m, o) => `const ${o} = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, name: 'exposure' }`,
    why: 'a device that cannot linearly filter full float read exposure 0 and drew a black screen',
  },
  {
    // A SECOND FULL PASS OVER THE STREET, FOR A DEVICE THAT CANNOT AFFORD THE
    // FIRST. Measured on the moto with the frame broken into phases:
    //
    //     fixed 9.2  update 8.8  late 3.4  render 39.4   — 60.8 ms of JS
    //     …in a frame that took 203 ms
    //
    // so ~140 ms of every frame is the GPU, with the CPU waiting on it. The
    // render scale is already at its 0.18 floor, so this is not fill rate: it
    // is 3.4M triangles across 450 draw calls, which is what a Mali-G52 cannot
    // do. That triangle count is the sum over ALL passes in the frame, and the
    // cascade is a whole extra pass over the same street.
    //
    // csm.enabled already gates it — there is simply no way to reach the flag
    // from a quality preset, so a device cannot decline shadows however slow
    // they make it. Unset, `q.shadows` is undefined and this is upstream's
    // behaviour exactly.
    file: 'src/render/csm.js',
    find: /this\.enabled\s*=\s*true;/,
    replace: () => 'this.enabled = opts.enabled !== false;',
    why: 'let a device that cannot afford a second pass over the street decline the cascade',
  },
  {
    file: 'src/render/index.js',
    find: /this\.csm\s*=\s*new\s+CascadedShadowMaps\(\s*renderer\s*,\s*\{\s*cascades:\s*q\.cascades,/,
    replace: (m) => m.replace('cascades: q.cascades,', 'enabled: q.shadows !== false,\n      cascades: q.cascades,'),
    why: 'carry the shadows knob from the quality preset into the cascade',
  },
  {
    // THE DEPTH PREPASS IS A THIRD WALK OVER THE STREET. With the cascade gone
    // the moto still draws 2.16M triangles across 319 calls for one frame,
    // because the scene is rendered twice: once into the gbuffer and once for
    // real. On a tile-based mobile GPU that is close to pure loss — a tiler
    // already resolves hidden surfaces per tile, which is the work a depth
    // prepass exists to save on an immediate-mode desktop part.
    //
    // Upstream keeps it unconditional because depthTexture and velocityTexture
    // are "part of the public contract" for soft particles, SSR and motion
    // blur. At this preset SSR, GTAO, contact shadows, motion blur and TAA are
    // all already off, and the one consumer left reads
    // `this.needsPrepass ? this.depthTexture : null` — it is written to take
    // null. What it costs is soft-particle depth fade: smoke and sparks meet
    // geometry with a hard edge instead of a soft one. Unset, this is upstream.
    file: 'src/render/index.js',
    find: /this\.needsPrepass\s*=\s*true;/,
    replace: () => 'this.needsPrepass = q.prepass !== false;',
    why: 'let a tile-based mobile GPU skip a depth prepass that only pays off on a desktop',
  },
  {
    // THE CANVAS IS 1.5x WHATEVER THE RENDER SCALE SAYS. renderScale shrinks the
    // engine's internal targets; the DRAWING BUFFER is sized separately, from
    // min(devicePixelRatio, 1.5). On the moto that is 616x1114 while the scene
    // is being rendered at 0.18 — so every frame ends with a big upscale blit,
    // and Chrome then composites that buffer into the page and scales it again.
    //
    // That work is invisible to everything measured so far: gl.finish() after
    // the frame's JS returns 0.1 ms, so our own GL queue is empty, and the
    // compositor's copy happens later and in another process. Halving the
    // buffer's linear size quarters those pixels. The image barely changes,
    // because at renderScale 0.18 it is already far softer than the buffer it
    // is being stretched into. Unset, this is upstream's min(dpr, 1.5).
    file: 'src/render/index.js',
    find: /const\s+pr\s*=\s*Math\.min\(\s*globalThis\.devicePixelRatio\s*\|\|\s*1\s*,\s*1\.5\s*\);/,
    replace: () => 'const pr = this.ctx.config.q.pixelRatio || Math.min(globalThis.devicePixelRatio || 1, 1.5);',
    why: 'let a phone stop compositing a canvas 1.5x bigger than the picture in it',
  },
  {
    // NOTHING IS EVER TOO FAR AWAY TO DRAW. The camera's far plane is 1200
    // metres for a street the minimap measures in tens, so three.js frustum
    // culling never removes anything and the phone submits every building in
    // the world every frame — 256 draw calls and 1.26M triangles, which is
    // where the remaining 29 ms of render JS goes.
    //
    // Applied in resize() rather than at the camera's construction, because
    // config.q is not populated when the Engine is built and the patch would
    // silently read undefined and change nothing. resize() runs during init()
    // and on every resize after, and already rebuilds the projection matrix.
    // Unset, the far plane stays upstream's 1200.
    file: 'src/core/engine.js',
    find: /this\.camera\.aspect = w \/ h;\s*this\.camera\.updateProjectionMatrix\(\);/,
    replace: () => [
      'this.camera.aspect = w / h;',
      '    const _dd = this.ctx && this.ctx.config && this.ctx.config.q && this.ctx.config.q.drawDistance;',
      '    if (_dd) this.camera.far = _dd;',
      '    this.camera.updateProjectionMatrix();',
    ].join('\n'),
    why: 'let a weak device stop drawing a street it cannot see the end of',
  },
  {
    // THE WHOLE FRAME WAS FOG, AND THE GUN WAS THE ONLY THING LEFT IN IT.
    //
    // Reported as "the entire bottom half of the screen is blacked/faded/clouded
    // out" and blamed, reasonably, on the weapon. It is not the weapon: rendered
    // to its own target the rifle is correctly lit, in full detail.
    //
    // The sky's aerial-perspective pass is depth-driven — `bool sky = depth <= 0.0`
    // — and it binds `r.depthTexture` with no null check. Turning the depth
    // PREPASS off (which this app does, because it was a third full walk over the
    // street) leaves that texture allocated and never written, so it reads 0
    // EVERYWHERE. Every pixel therefore takes the sky branch at maximum fog
    // distance, downward rays integrate the entire ground-haze layer, and the
    // lower half of the frame is replaced by pure in-scatter. The viewmodel is
    // composited after the registered passes on purpose ("compositing earlier
    // would bury the weapon in 40 m of aerial perspective"), so it is the one
    // thing in frame NOT lifted by that in-scatter — which is exactly why it read
    // as a black silhouette.
    //
    // Proven by A/B on real hardware: same box, same preset, prepass the only
    // difference, symptom present and absent; and toggling this single pass at
    // runtime on the broken build makes both the whiteout and the black gun
    // vanish and return. No depth, no fog — every other depth consumer in the
    // engine already guards this way (fx soft particles, haze), this one forgot.
    file: 'src/sky/index.js',
    find: /this\._unregisterPass = r\.registerPass\(this\.volumetrics\);/,
    replace: () =>
      'this.volumetrics.enabled = r.needsPrepass !== false;\n' +
      '    this._unregisterPass = r.registerPass(this.volumetrics);',
    why: 'a fog pass reading an unwritten depth buffer painted the whole frame as 900 m of haze',
  },
  {
    // And say out loud that there is no depth this frame, rather than publishing
    // a buffer nothing ever wrote. Not what fixed the fog (three.js binds a
    // zeroed 1x1 texture for a null sampler, so the pass would still have read
    // zeroes) — it makes the state legible to every consumer that already checks
    // for it, and stops soft particles depth-testing against a buffer of noise.
    file: 'src/render/index.js',
    find: /this\.depthTexture = this\.gbuffer\.depthTexture;\s*\n\s*this\.velocityTexture = this\.gbuffer\.velocityTexture;/,
    replace: () =>
      'this.depthTexture = this.needsPrepass ? this.gbuffer.depthTexture : null;\n' +
      '    this.velocityTexture = this.needsPrepass ? this.gbuffer.velocityTexture : null;',
    why: 'publish no depth texture when no depth was rendered',
  },
  {
    // AND THE SKY WAS BLACK, FOR THE THIRD TIME, FOR THE SAME REASON.
    //
    // floatTarget() is hdrTarget() with the type forced to FloatType — and, like
    // the exposure meter before it, WITHOUT overriding the filters, which
    // hdrTarget defaults to LinearFilter. Its one caller is the atmosphere's
    // TRANSMITTANCE LUT (sky/luts.js). On a GPU with no OES_texture_float_linear
    // — this Mali-G52 — a full-float texture with linear filtering is incomplete
    // and samples as (0,0,0,1) with no GL error, so the atmosphere transmits
    // nothing and the sky renders BLACK. It was black in every phone screenshot
    // taken all night, on a game whose own description begins "a sunlit market
    // street", while a desktop showed blue sky and clouds.
    //
    // Half float, for the same reasons as the exposure fix: it is linearly
    // filterable in core WebGL2, and the LUT stores transmittance in [0,1] where
    // ten bits of mantissa is far more than the banding this comment worries
    // about — that comment is about 8-bit, which this still is not.
    file: 'src/sky/fullscreen.js',
    find: /return hdrTarget\(w, h, \{ type: THREE\.FloatType, \.\.\.opts \}\);/,
    replace: () => 'return hdrTarget(w, h, { type: THREE.HalfFloatType, ...opts });',
    why: 'a device that cannot linearly filter full float rendered a black sky over a sunlit street',
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
