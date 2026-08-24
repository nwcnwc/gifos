/*
 * vendor.mjs — extract community levels from the pinned upstream
 * into classic-script vendor/levels.js. Run only to move the pin.
 *
 *   QUEENS_SRC=/path/to/queens-game node apps/queens/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const UPSTREAM = 'https://github.com/samimsu/queens-game.git';
const PIN = '4b0cad39a36a99c974d427bea9f1cad43518e97a';

const COLORS = {
  altoMain: '#6C7A89', anakiwa: '#3287BD', atomicTangerine: '#C06C84',
  bittersweet: '#D53E4F', celadon: '#ACDDA5', chardonnay: '#FDAE61',
  emerald: '#4B6B5F', halfBaked: '#65C2A5', lavenderRose: '#8E6E8E',
  lightGreen: '#607D3B', lightOrchid: '#F56D43', lightWisteria: '#5E4FA2',
  nomad: '#8E8875', periwinkle: '#4A5A77', saharaSand: '#E6F598',
  turquoiseBlue: '#467A7D', white: '#FFFFFF',
  alto: '#4A525A', canCan: '#7D435D', carnation: '#8E3D30',
  coldPurple: '#665B82', feijoa: '#5E7A5A', macNCheese: '#A67A50',
  malibu: '#466B8E', manz: '#B5A642', tallow: '#6B6554',
};

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.QUEENS_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'queens-'));
  src = join(tmp, 'queens-game');
  run('git', ['clone', '--quiet', '--depth', '1', UPSTREAM, src]);
  const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
  if (at !== PIN) {
    run('git', ['fetch', '--quiet', '--depth', '1', 'origin', PIN], src);
    run('git', ['checkout', '--quiet', PIN], src);
  }
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN);

const levelDir = join(src, 'src', 'utils', 'community-levels');
const files = readdirSync(levelDir).filter((n) => /^level\d+\.ts$/.test(n));
files.sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));

function parseLevel(text, name) {
  const sizeM = text.match(/size:\s*(\d+)/);
  if (!sizeM) throw new Error(name + ': no size');
  const size = +sizeM[1];
  const regM = text.match(/colorRegions:\s*\[([\s\S]*?)\],\s*regionColors/);
  if (!regM) throw new Error(name + ': no colorRegions');
  const rows = [];
  const rowRe = /\[([^\]]+)\]/g;
  let m;
  while ((m = rowRe.exec(regM[1]))) {
    const cells = m[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean);
    if (cells.length) rows.push(cells.join(''));
  }
  if (rows.length !== size) throw new Error(name + ': rows ' + rows.length + ' != ' + size);
  for (const r of rows) if (r.length !== size) throw new Error(name + ': ragged row ' + r);
  const colM = text.match(/regionColors:\s*\{([\s\S]*?)\}/);
  if (!colM) throw new Error(name + ': no regionColors');
  const colors = {};
  const pairRe = /([A-Z])\s*:\s*([A-Za-z]+)/g;
  while ((m = pairRe.exec(colM[1]))) {
    const hex = COLORS[m[2]];
    if (!hex) throw new Error(name + ': unknown color ' + m[2]);
    colors[m[1]] = hex;
  }
  if (!Object.keys(colors).length) throw new Error(name + ': empty colors');
  return { size, r: rows, c: colors };
}

const levels = [];
for (const name of files) {
  const text = readFileSync(join(levelDir, name), 'utf8');
  const id = parseInt(name.match(/\d+/)[0], 10);
  levels.push(Object.assign({ id }, parseLevel(text, name)));
}

const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });
const body = 'window.QUEENS_LEVELS = ' + JSON.stringify(levels) + ';\n';
writeFileSync(join(vendor, 'levels.js'), body);
copyFileSync(join(src, 'LICENSE'), join(vendor, 'COPYING-queens.txt'));

const sha = createHash('sha256').update(body).digest('hex');
writeFileSync(join(vendor, 'UPSTREAM.txt'),
  'samimsu/queens-game\n' +
  'https://github.com/samimsu/queens-game\n' +
  'commit:  ' + PIN + '\n' +
  'files:   src/utils/community-levels/level*.ts (' + levels.length + ' levels)\n' +
  'sha256:  ' + sha + '  vendor/levels.js\n' +
  'license: MIT (COPYING-queens.txt; upstream copyright line is the codespaces template leftover)\n' +
  '\n' +
  'Patreon packs, Vercel analytics, and Giscus comments are not packed.\n' +
  'The board is a classic-script rewrite of src/utils/gameLogic.ts + useGameLogic.ts.\n'
);
console.log('wrote vendor/levels.js —', levels.length, 'levels,', (body.length / 1024).toFixed(0), 'KB, sha256', sha.slice(0, 12));
if (tmp) rmSync(tmp, { recursive: true, force: true });
