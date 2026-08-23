/*
 * vendor.mjs — rebuild vendor/ from the pinned upstream.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs. The App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/dante/vendor.mjs
 *   DANTE_SRC=/path/to/checkout node apps/dante/vendor.mjs
 *
 * WHAT IT PRODUCES.
 *   vendor/game.js            upstream dist/1-build, patched. Never edit.
 *   vendor/COPYING-dante.txt  MIT (Salvatore Previti)
 *   vendor/COPYING-soundbox.txt  zlib (Marcus Geelnard / SoundBox)
 *   vendor/UPSTREAM.txt
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const UPSTREAM = 'https://github.com/SalvatorePreviti/js13k-2022.git';
const PIN = 'b88e159f3905843f1f420e409430e1c2e5c9931f'; // 2023-02-02 README

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 180000 });

let src = process.env.DANTE_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'dante-'));
  src = join(tmp, 'dante');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) {
  throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');
}

const built = join(src, 'dist', '1-build', 'index.js');
if (!existsSync(built)) {
  throw new Error('upstream is missing dist/1-build/index.js — that tree ships the bundle');
}

let game = readFileSync(built, 'utf8');
game = game.replace(/\n\/\/# sourceMappingURL=.*$/, '');

function patch(find, replace, why) {
  if (!find.test(game)) {
    throw new Error('PATCH NO LONGER APPLIES: ' + why
      + '\n  Upstream moved this code. Re-target the patch or drop it DELIBERATELY;'
      + '\n  building without it silently loses what it was for.');
  }
  game = game.replace(find, replace);
  console.log('patched — ' + why);
}

// dist/1-build still calls NO_INLINE(); the minifier normally eats it.
if (!/window\.NO_INLINE/.test(game)) {
  game = 'window.NO_INLINE = function (fn) { return fn; };\n' + game;
  console.log('patched — define NO_INLINE (1-build still calls it)');
}

patch(
  /const resetGame = \(\) => \{\n  localStorage\[LOCAL_STORAGE_SAVED_GAME_KEY\] = "";\n  location\.reload\(\);\n\};/,
  `const resetGame = () => {
  localStorage[LOCAL_STORAGE_SAVED_GAME_KEY] = "";
  game_completed = 0;
  player_last_pulled_lever = LEVER_ID_BOAT0;
  secondBoatLerp = 0;
  setGameTime(0);
  loadGame();
  player_position_final.x = 0;
  player_position_final.y = -40;
  player_position_final.z = 0;
  showMessage("Restarted", 2);
};`,
  'restart in-place — a GifOS app cannot reload the srcdoc'
);

patch(
  /initTriangleBuffers\(\);\n      loadGame\(\);\n      loadStep\(end\);/,
  `initTriangleBuffers();
      var _boot = function () { loadGame(); loadStep(end); };
      if (window.DanteSave && window.DanteSave.ready) window.DanteSave.ready.then(_boot); else _boot();`,
  'wait for gifos.db save to hydrate before loadGame'
);

patch(
  /gl\["uae"\]\(mainShader\(uniformName_csm_matrices\), false, csm_lightSpaceMatrices\);\n    renderModels\(gl, MODEL_ID_SOUL, player_first_person\);\n    skyShader\(\);/,
  `gl["uae"](mainShader(uniformName_csm_matrices), false, csm_lightSpaceMatrices);
    renderModels(gl, MODEL_ID_SOUL, player_first_person);
    if (window.DanteEngine && window.DanteEngine.drawGhosts) window.DanteEngine.drawGhosts(gl, mainShader);
    skyShader();`,
  'optional ghosts drawn with the same player mesh after the world pass'
);

patch(
  /\nloadStep\(\(\) => \{\n  let loadStatus = 0;/,
  `
window.DanteEngine = {
  allModels: allModels,
  transformsBuffer: transformsBuffer,
  matrixToArray: matrixToArray,
  player_position_final: player_position_final,
  camera_rotation: camera_rotation,
  souls: souls,
  MODEL_ID_PLAYER_BODY: MODEL_ID_PLAYER_BODY,
  MODEL_ID_PLAYER_LEG0: MODEL_ID_PLAYER_LEG0,
  MODEL_ID_PLAYER_LEG1: MODEL_ID_PLAYER_LEG1,
  loadGame: loadGame,
  saveGame: saveGame,
  resetGame: resetGame,
  soulsCount: function () { return souls_collected_count | 0; }
};
loadStep(() => {
  let loadStatus = 0;`,
  'export engine bits for ghosts, save, and the roster'
);

if (/location\.reload/.test(game)) {
  throw new Error('game.js still contains location.reload — the in-place restart patch missed one');
}
if (/\bfetch\s*\(/.test(game)) throw new Error('game.js contains fetch(');
if (/<\/script/i.test(game)) throw new Error('game.js contains </script — cannot inline safely');
if (/^\s*import\s|^\s*export\s/m.test(game)) {
  throw new Error('game.js uses ESM syntax — GifOS inlines classic scripts');
}
if (!/window\.DanteEngine/.test(game)) throw new Error('DanteEngine was not attached');
if (!/DanteEngine\.drawGhosts/.test(game)) throw new Error('drawGhosts hook was not inserted');

const out = join(dir, 'vendor');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'game.js'), game);
copyFileSync(join(src, 'LICENSE'), join(out, 'COPYING-dante.txt'));

const soundbox = `zlib License

Copyright (c) 2011-2013 Marcus Geelnard

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

2. Altered source versions must be plainly marked as such, and must not
   be misrepresented as being the original software.

3. This notice may not be removed or altered from any source
   distribution.

Dante ships a heavily modified SoundBox player (sb.bitsnbites.eu) with
Ryan Malm's arrangement of Beethoven's Piano Sonata No. 14 baked in.
The notice is taken from app/music/music-player.ts of SalvatorePreviti/js13k-2022.
`;
writeFileSync(join(out, 'COPYING-soundbox.txt'), soundbox);

writeFileSync(join(out, 'UPSTREAM.txt'),
  'vendor/game.js is GENERATED. Do not edit it; run node apps/dante/vendor.mjs.\n'
  + '\n'
  + 'upstream: ' + UPSTREAM.replace(/\.git$/, '') + '\n'
  + 'commit:   ' + PIN + '\n'
  + 'license:  MIT (COPYING-dante.txt); SoundBox zlib (COPYING-soundbox.txt)\n'
  + 'music:    Ryan Malm, after Beethoven Piano Sonata No. 14\n'
  + '\n'
  + 'game.js is upstream dist/1-build/index.js (the Vite classic bundle,\n'
  + 'DEBUG compiled out, shaders and the ground SVG already inlined). A GIF\n'
  + 'srcdoc cannot fetch and cannot reload, so three patches land here:\n'
  + '  - NO_INLINE is defined (the 1-build still calls it)\n'
  + '  - Restart clears the save and drops the player; no location.reload\n'
  + '  - loadGame waits for DanteSave.ready so gifos.db can hydrate first\n'
  + '  - After the colour pass, DanteEngine.drawGhosts may paint extra bodies\n'
  + '  - window.DanteEngine exposes player pose, meshes, and save/load\n'
  + 'Both notices travel INSIDE the GIF as well as beside it here.\n'
);

if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote vendor/game.js —', (game.length / 1024).toFixed(0), 'KB from dist/1-build @', PIN.slice(0, 10));
