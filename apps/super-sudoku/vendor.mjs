/*
 * vendor.mjs — rebuild vendor/ from the pinned TN1ck/super-sudoku commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/super-sudoku/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');
const UPSTREAM = 'https://github.com/TN1ck/super-sudoku.git';
const PIN = '165dcdba85f01624faf2acfd1524fdd8ac8bef63';
const FILES = ['easy.txt', 'medium.txt', 'hard.txt', 'expert.txt', 'evil.txt'];

const tmp = mkdtempSync(join(tmpdir(), 'super-sudoku-'));
try {
  execFileSync('git', ['clone', '--depth', '1', UPSTREAM, tmp], { stdio: 'inherit' });
  execFileSync('git', ['-C', tmp, 'fetch', '--depth', '1', 'origin', PIN], { stdio: 'inherit' });
  execFileSync('git', ['-C', tmp, 'checkout', PIN], { stdio: 'inherit' });
  mkdirSync(out, { recursive: true });
  for (const f of FILES) copyFileSync(join(tmp, 'sudokus', f), join(out, f));
  copyFileSync(join(tmp, 'LICENSE'), join(out, 'COPYING-super-sudoku.txt'));
  writeFileSync(join(out, 'UPSTREAM.txt'),
    'TN1ck/super-sudoku\n' +
    UPSTREAM + '\n' +
    'commit ' + PIN + '\n' +
    'Puzzles: sudokus/{easy,medium,hard,expert,evil}.txt\n' +
    'MIT License, Tom Nick, 2023\n');
  for (const f of FILES) {
    const n = readFileSync(join(out, f), 'utf8').split('\n').filter((l) => /^[0-9]{81}$/.test(l.trim())).length;
    if (n < 500) throw new Error(f + ' has only ' + n + ' puzzles');
    console.log(f, n, 'puzzles');
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('wrote vendor/ from', PIN);
