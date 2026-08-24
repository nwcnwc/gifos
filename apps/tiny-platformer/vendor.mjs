/*
 * vendor.mjs — rebuild vendor/ from the pinned javascript-tiny-platformer commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs. Run this only to move the pin.
 *
 *   node apps/tiny-platformer/vendor.mjs
 *   TINY_SRC=/path/to/checkout node apps/tiny-platformer/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');

const UPSTREAM = 'https://github.com/jakesgordon/javascript-tiny-platformer.git';
const PIN = '50cbd06c410efe768b7c76f4458387a194130339';

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.TINY_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'tiny-plat-'));
  src = join(tmp, 'tiny-platformer');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN);

mkdirSync(out, { recursive: true });
copyFileSync(join(src, 'LICENSE'), join(out, 'COPYING.txt'));
copyFileSync(join(src, 'level.json'), join(out, 'level.json'));
{
  const level = readFileSync(join(src, 'level.json'), 'utf8');
  JSON.parse(level); // refuse a broken map
  writeFileSync(join(out, 'level.js'), 'window.TINY_LEVEL = ' + level + ';\n');
}

let js = readFileSync(join(src, 'platformer.js'), 'utf8');

// Sandbox cannot XHR. The level rides as vendor/level.json, inlined by boot.js
// as window.TINY_LEVEL before this script runs.
js = js.replace(
  /get\("level\.json", function\(req\) \{[\s\S]*?frame\(\);\s*\}\);/,
  'if (!window.TINY_LEVEL) throw new Error("TINY_LEVEL missing");\n  setup(window.TINY_LEVEL);\n  frame();'
);

// fpsmeter is a debug overlay we do not ship. Stub the constructor the loop calls.
js = js.replace(
  'fpsmeter = new FPSMeter({ decimals: 0, graph: true, theme: \'dark\', left: \'5px\' });',
  'fpsmeter = { tickStart: function () {}, tick: function () {} };'
);

// Camera: original paints the entire 64×48 tile map onto a huge canvas and CSS-
// shrinks it. On a phone the player is a few pixels. Follow the player instead.
js = js.replace(
  'width    = canvas.width  = MAP.tw * TILE,',
  'VIEW_TW  = 20,\n      VIEW_TH  = 15,\n      width    = canvas.width  = VIEW_TW * TILE,'
);
js = js.replace(
  'height   = canvas.height = MAP.th * TILE,',
  'height   = canvas.height = VIEW_TH * TILE,'
);

js = js.replace(
  `function render(ctx, frame, dt) {
    ctx.clearRect(0, 0, width, height);
    renderMap(ctx);
    renderTreasure(ctx, frame);
    renderPlayer(ctx, dt);
    renderMonsters(ctx, dt);
  }`,
  `function camera() {
    var maxx = MAP.tw * TILE - width, maxy = MAP.th * TILE - height;
    return {
      x: bound(player.x - width / 2 + TILE / 2, 0, Math.max(0, maxx)),
      y: bound(player.y - height / 2 + TILE / 2, 0, Math.max(0, maxy))
    };
  }

  function render(ctx, frame, dt) {
    var cam = camera();
    ctx.setTransform(1, 0, 0, 1, -cam.x, -cam.y);
    ctx.clearRect(cam.x, cam.y, width, height);
    renderMap(ctx);
    renderTreasure(ctx, frame);
    renderPlayer(ctx, dt);
    renderMonsters(ctx, dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (window.Tiny && window.Tiny.onFrame) window.Tiny.onFrame(player, cam);
  }`
);

// Expose the player so the phone overlay can write the same flags the keyboard does.
js = js.replace(
  'document.addEventListener(\'keydown\', function(ev) { return onkey(ev, ev.keyCode, true);  }, false);\n  document.addEventListener(\'keyup\',   function(ev) { return onkey(ev, ev.keyCode, false); }, false);',
  `document.addEventListener('keydown', function(ev) { return onkey(ev, ev.keyCode, true);  }, false);
  document.addEventListener('keyup',   function(ev) { return onkey(ev, ev.keyCode, false); }, false);

  window.Tiny = window.Tiny || {};
  window.Tiny.player = function () { return player; };
  window.Tiny.onkey = onkey;
  window.Tiny.KEY = KEY;
  window.Tiny.TILE = TILE;`
);

js = js.replace(
  `function renderPlayer(ctx, dt) {
    ctx.fillStyle = COLOR.YELLOW;
    ctx.fillRect(player.x + (player.dx * dt), player.y + (player.dy * dt), TILE, TILE);

    var n, max;

    ctx.fillStyle = COLOR.GOLD;
    for(n = 0, max = player.collected ; n < max ; n++)
      ctx.fillRect(t2p(2 + n), t2p(2), TILE/2, TILE/2);

    ctx.fillStyle = COLOR.SLATE;
    for(n = 0, max = player.killed ; n < max ; n++)
      ctx.fillRect(t2p(2 + n), t2p(3), TILE/2, TILE/2);
  }`,
  `function renderPlayer(ctx, dt) {
    ctx.fillStyle = COLOR.YELLOW;
    ctx.fillRect(player.x + (player.dx * dt), player.y + (player.dy * dt), TILE, TILE);
  }`
);

js = js.replace(
  'function collectTreasure(t) {\n    player.collected++;\n    t.collected = true;\n  }',
  `function collectTreasure(t) {
    player.collected++;
    t.collected = true;
    if (window.Tiny && window.Tiny.onProgress) window.Tiny.onProgress(player);
  }`
);

js = js.replace(
  'function killMonster(monster) {\n    player.killed++;\n    monster.dead = true;\n  }',
  `function killMonster(monster) {
    player.killed++;
    monster.dead = true;
    if (window.Tiny && window.Tiny.onProgress) window.Tiny.onProgress(player);
  }`
);

if (/<\/script/i.test(js)) throw new Error('platformer.js contains </script');
if (js.includes('get("level.json"')) throw new Error('XHR load of level.json still present');
if (js.includes('new FPSMeter')) throw new Error('FPSMeter still constructed');

writeFileSync(join(out, 'platformer.js'), js);

const sha = (p) => createHash('sha256').update(readFileSync(join(out, p))).digest('hex');
writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/tiny-platformer/vendor.mjs.

upstream: ${UPSTREAM.replace(/\.git$/, '')}
commit:   ${PIN}
date:     2025-06-01
license:  MIT (COPYING.txt)

Copied:
  level.json        original Tiled map (coins, monsters, platforms)
  level.js          same map as window.TINY_LEVEL (classic script)
  platformer.js     original engine with these GifOS-only edits:
    - level.json is window.TINY_LEVEL (no XHR)
    - FPSMeter stubbed (debug overlay not shipped)
    - camera follows the player (phone-readable)
    - window.Tiny exposes player + onkey for the overlay
    - onProgress hook when a coin or monster is taken

NOT copied:
  fpsmeter.min.js   debug overlay
  tiles.png         unused by the current renderer (coloured rects)
  level.tmx         Tiled source of level.json

sha256:
  platformer.js  ${sha('platformer.js')}
  level.json     ${sha('level.json')}
  COPYING.txt    ${sha('COPYING.txt')}

The MIT notice travels INSIDE the GIF as COPYING.txt as well as here.
`);

if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote apps/tiny-platformer/vendor/ from', PIN.slice(0, 10));

