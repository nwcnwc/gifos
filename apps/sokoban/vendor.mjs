/*
 * vendor.mjs — rebuild vendor/ from the pinned klevze/sokoban commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 * Upstream is Vite/ES modules plus a tileset, Firebase and a service worker.
 * We keep the fifty Tiled warehouses (the puzzles) and the MIT notice, then
 * write a compact walkable/wall/box/goal map so the game can be classic
 * scripts. Nothing else from that tree is shipped.
 *
 *   node apps/sokoban/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');
const UPSTREAM = 'https://github.com/klevze/sokoban.git';
const PIN = '210957e734e379ded0b6544f099abf99f5555055';

// Walkable tile IDs from src/js/config/config.js TILES.WALKABLE_TILES.
// Everything else that is not 0 is a wall. Tile 88 is the keeper's start.
const WALKABLE = new Set([
  10, 17, 18, 19, 20, 71, 72, 73, 74, 81, 82, 83, 84, 88, 89, 90,
  22, 23, 24, 25, 32, 33, 34, 35, 42, 43, 44, 45
]);

function convert(raw, id) {
  const w = raw.width;
  const h = raw.height;
  if (!w || !h) throw new Error('level ' + id + ' missing size');
  const layers = raw.layers || [];
  if (layers.length < 3) throw new Error('level ' + id + ' needs map/goal/box layers');
  const mapL = layers[0].data;
  const goalL = layers[1].data;
  const boxL = layers[2].data;
  if (mapL.length !== w * h || goalL.length !== w * h || boxL.length !== w * h) {
    throw new Error('level ' + id + ' layer length mismatch');
  }
  const cells = [];
  let players = 0, boxes = 0, goals = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const tile = mapL[i];
      const wall = tile !== 0 && !WALKABLE.has(tile);
      const floor = WALKABLE.has(tile);
      const goal = goalL[i] > 0;
      const box = boxL[i] > 0;
      const ply = tile === 88;
      if (ply) players++;
      if (box) boxes++;
      if (goal) goals++;
      if (box && !floor) throw new Error('level ' + id + ' box off the floor at ' + x + ',' + y);
      if (goal && !floor) throw new Error('level ' + id + ' goal off the floor at ' + x + ',' + y);
      if (ply && !floor) throw new Error('level ' + id + ' player off the floor at ' + x + ',' + y);
      let ch = ' ';
      if (wall) ch = '#';
      else if (floor) {
        if (box && goal) ch = '*';
        else if (box) ch = '$';
        else if (ply && goal) ch = '+';
        else if (ply) ch = '@';
        else if (goal) ch = '.';
        else ch = '-';
      }
      cells.push(ch);
    }
  }
  if (players !== 1) throw new Error('level ' + id + ' has ' + players + ' keepers');
  if (boxes < 1 || boxes !== goals) {
    throw new Error('level ' + id + ' boxes/goals ' + boxes + '/' + goals);
  }

  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cells[y * w + x] === ' ') continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  let map = '';
  for (let y = minY; y <= maxY; y++) {
    map += cells.slice(y * w + minX, y * w + minX + cw).join('');
  }
  return { id: id, w: cw, h: ch, boxes: boxes, map: map };
}

const tmp = mkdtempSync(join(tmpdir(), 'sokoban-'));
try {
  execFileSync('git', ['clone', '--depth', '1', UPSTREAM, tmp], { stdio: 'inherit' });
  execFileSync('git', ['-C', tmp, 'fetch', '--depth', '1', 'origin', PIN], { stdio: 'inherit' });
  execFileSync('git', ['-C', tmp, 'checkout', PIN], { stdio: 'inherit' });
  mkdirSync(out, { recursive: true });
  copyFileSync(join(tmp, 'LICENSE'), join(out, 'COPYING-sokoban.txt'));

  const levels = [];
  for (let n = 1; n <= 50; n++) {
    const name = 'level' + String(n).padStart(2, '0') + '.json';
    const raw = JSON.parse(readFileSync(join(tmp, 'src', 'js', 'levels', name), 'utf8'));
    const lv = convert(raw, n);
    levels.push(lv);
    console.log('level', n, lv.w + 'x' + lv.h, lv.boxes, 'boxes');
  }
  if (levels.length !== 50) throw new Error('expected 50 levels');
  writeFileSync(join(out, 'levels.json'), JSON.stringify(levels));
  writeFileSync(join(out, 'UPSTREAM.txt'),
    'klevze/sokoban\n' +
    UPSTREAM + '\n' +
    'commit ' + PIN + '\n' +
    'Puzzles: src/js/levels/level01.json … level50.json\n' +
    'Walkable tiles: src/js/config/config.js TILES.WALKABLE_TILES\n' +
    'MIT License, Gregor (klevze), 2025\n');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('wrote vendor/ from', PIN);
