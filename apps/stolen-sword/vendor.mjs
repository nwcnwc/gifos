/*
 * vendor.mjs — rebuild vendor/ from the pinned upstream.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs. The App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/stolen-sword/vendor.mjs
 *   STOLEN_SWORD_SRC=/path/to/checkout node apps/stolen-sword/vendor.mjs
 *
 * WHAT IT PRODUCES.
 *   vendor/game.js     the original ESM sources, flattened to one classic
 *                      IIFE (GifOS inlines <script src> and drops
 *                      type=module). Never edit; rerun this.
 *   vendor/COPYING-stolen-sword.txt
 *   vendor/UPSTREAM.txt
 */
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const UPSTREAM = 'https://github.com/chiaogu/stolen-sword.git';
const PIN = 'e5aa6e06ce50545df80e5bdfdde4122b5e267d09';

// Evaluation order: dependencies first. animation.js imports state.js, so
// state is listed before animation. Stage files before helper/stage.js so
// `stages` exists when setStage is defined. Player after stage (setStage).
const SOURCES = [
  'constants.js',
  'easing.js',
  'utils.js',
  'helper/sound.js',
  'state.js',
  'animation.js',
  'helper/graphic.js',
  'helper/projectile.js',
  'helper/enemy.js',
  'helper/platform.js',
  'stages/stage1.js',
  'stages/stage2.js',
  'stages/stage3.js',
  'stages/stage4.js',
  'stages/index.js',
  'helper/stage.js',
  'modules/player.js',
  'modules/background.js',
  'modules/time.js',
  'modules/objects.js',
  'modules/interaction.js',
  'modules/index.js',
  'index.js',
];

const DEFAULT_NAME = {
  'modules/background.js': '_modBackground',
  'modules/time.js': '_modTime',
  'modules/objects.js': '_modObjects',
  'modules/interaction.js': '_modInteraction',
  'modules/index.js': 'modules',
  'stages/stage1.js': 'stage1',
  'stages/stage2.js': 'stage2',
  'stages/stage3.js': 'stage3',
  'stages/stage4.js': 'stage4',
  'stages/index.js': 'stages',
};

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 180000 });

let src = process.env.STOLEN_SWORD_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'stolen-sword-'));
  src = join(tmp, 'stolen-sword');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) {
  throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');
}

function stripImports(src) {
  return src.replace(
    /\bimport\s+(?:[\w*\s{},$]+from\s+)?['"][^'"]+['"]\s*;?/g,
    ''
  );
}

function flatten(src, file) {
  let body = stripImports(src);

  if (file === 'state.js') {
    body = body.replace(
      /export const needTutorial = load\(KEY_SAVE_NEED_TUTORIAL\) != 1;/,
      'let needTutorial = true;'
    );
  }

  if (file === 'helper/stage.js') {
    body = body.replace(
      /setStage\(\+load\(KEY_SAVE_STAGE\) \|\| 0\);/,
      '/* boot deferred to StolenSword.start */'
    );
  }

  if (file === 'index.js') {
    body = body.replace(/\ntick\(\);\n/, '\n/* loop deferred to StolenSword.start */\n');
  }

  if (file === 'helper/sound.js') {
    body = body.replace(
      'let zzfxX=new(window.AudioContext||webkitAudioContext) // audio context',
      'let zzfxX;\ntry { zzfxX = new (window.AudioContext || window.webkitAudioContext); } catch (e) { zzfxX = null; }'
    );
    body = body.replace(
      'export function resumeAudio() {\n  zzfxX.resume();\n}',
      `function resumeAudio() {
  if (!zzfxX) {
    try { zzfxX = new (window.AudioContext || window.webkitAudioContext); } catch (e) { return; }
  }
  if (zzfxX && zzfxX.resume) zzfxX.resume();
}`
    );
    body = body.replace(
      'zzfx(...sounds[4]);',
      'if (zzfxX) zzfx(...sounds[4]);'
    );
    body = body.replace(
      'zzfx(...sounds[index]);',
      'if (zzfxX) zzfx(...sounds[index]);'
    );
  }

  if (file === 'modules/interaction.js') {
    body = body.replace(
      `window.addEventListener('touchstart', ({ touches }) => onPressDown(touches[0]));
window.addEventListener('touchmove', ({ touches }) => onPressMove(touches[0]));
window.addEventListener('touchend', ({ touches }) => onPressUp(touches[0]));`,
      `window.addEventListener('touchstart', (e) => { e.preventDefault(); onPressDown(e.touches[0] || e.changedTouches[0]); }, { passive: false });
window.addEventListener('touchmove', (e) => { e.preventDefault(); if (e.touches[0]) onPressMove(e.touches[0]); }, { passive: false });
window.addEventListener('touchend', (e) => { e.preventDefault(); onPressUp(e.changedTouches[0]); }, { passive: false });
window.addEventListener('touchcancel', (e) => { e.preventDefault(); onPressUp(e.changedTouches[0]); }, { passive: false });`
    );
  }

  if (file === 'modules/index.js') {
    return '\n/* ' + file + ' */\nvar modules = [_modBackground, _modTime, _modObjects, _modInteraction];\n';
  }

  if (file === 'stages/stage4.js') {
    body = body.replace(/\btempCamCenter\b/g, 'tempCamCenter4');
  }

  const defName = DEFAULT_NAME[file];
  if (defName) {
    body = body.replace(/export default\s+/, 'var ' + defName + ' = ');
  }
  body = body.replace(/^export /gm, '');

  return '\n/* ' + file + ' */\n' + body + '\n';
}

const srcDir = join(src, 'src');
let bundle = `/* GENERATED by apps/stolen-sword/vendor.mjs from chiaogu/stolen-sword@${PIN}.
 * Do not edit — rerun node apps/stolen-sword/vendor.mjs.
 * Original sources are ESM; GifOS inlines classic scripts, so this is one IIFE.
 */
(function (root) {
`;

for (const file of SOURCES) {
  const from = join(srcDir, file);
  const raw = readFileSync(from, 'utf8');
  bundle += flatten(raw, file);
}

bundle += `
root.StolenSword = {
  start: function () {
    needTutorial = load(KEY_SAVE_NEED_TUTORIAL) != 1;
    setStage(+load(KEY_SAVE_STAGE) || 0);
    resize();
    tick();
  },
  player: player,
  getFacing: function () { return facing; },
  stageIndex: function () { return $stageIndex.$; },
  stageWave: function () { return $stageWave.$; },
  health: function () { return $health.$; },
  started: function () { return !!$isGameStarted.$; },
  draw: draw,
  createSkeleton: createSkeletion,
  transform: transform,
  vector: vector,
  KEY_OBJECT_ON_UPDATE: KEY_OBJECT_ON_UPDATE,
  POSE_CHARGE: POSE_CHARGE,
  POSE_IDLE: POSE_IDLE,
  POSE_RUN: POSE_RUN,
  colors: function () {
    return ['#666', '#111', $health.$ == 2 ? '#c4c4c4' : '#ec5751', '#333', '#888'];
  }
};
})(typeof window !== 'undefined' ? window : globalThis);
`;

const leftover = bundle.match(/^\s*(import\s|export default|export const |export function |export \{)/gm);
if (leftover) {
  throw new Error('flatten left ESM syntax in vendor/game.js:\n' + leftover.slice(0, 30).join('\n'));
}

const outDir = join(dir, 'vendor');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'game.js'), bundle);
copyFileSync(join(src, 'LICENSE.md'), join(outDir, 'COPYING-stolen-sword.txt'));

writeFileSync(join(outDir, 'UPSTREAM.txt'),
  'vendor/game.js is Stolen Sword, flattened from ESM to one classic IIFE.\n' +
  'Do not edit it; run node apps/stolen-sword/vendor.mjs.\n' +
  '\n' +
  'upstream: ' + UPSTREAM.replace(/\.git$/, '') + '\n' +
  'commit:   ' + PIN + '\n' +
  'license:  MIT (COPYING-stolen-sword.txt)\n' +
  '\n' +
  'chiaogu\'s sources are ES modules + rollup. GifOS inlines <script src> and\n' +
  'drops type=module, so vendor.mjs concatenates the pin in dependency order,\n' +
  'strips import/export, and hangs window.StolenSword for the GifOS shell.\n' +
  'The notice travels INSIDE the GIF as well as beside it here.\n'
);

if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote vendor/game.js (' + (bundle.length / 1024).toFixed(0) + ' KB) from ' + PIN.slice(0, 10));
