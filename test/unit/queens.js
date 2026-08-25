// Queens has to actually place, clash, win, and remember the board.
//
// The GIF claimed "the board you were in the middle of stay in this file"
// while app.js wrote `board` and never read it back. Hundreds of levels
// without a restore is a daily-puzzle that forgets the morning. This suite
// PLAYS the tap loop in a vm — tap empty→X→queen, auto-X, a real 6×6 solved
// by the same tap() the GIF runs — and greps the shell for the restore,
// onBack, the room subscribe, and the phone board (touch-action).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'queens');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const sandbox = { console, Math, Object, Array, JSON, Date, String, Number, Boolean };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'vendor', 'levels.js'), 'utf8'), sandbox, { filename: 'levels.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'game.js'), 'utf8'), sandbox, { filename: 'game.js' });
  return sandbox;
}

const G = load();
const QNS = G.QNS;
const LEVELS = G.QUEENS_LEVELS;
check('game.js attaches QNS', !!(QNS && QNS.tap && QNS.checkWin && QNS.clashes));
check('768 community boards are aboard', Array.isArray(LEVELS) && LEVELS.length === 768, (LEVELS && LEVELS.length));

{
  const ids = LEVELS.map((l) => l.id);
  check('ids are 1..768 unique', ids[0] === 1 && ids[767] === 768 && new Set(ids).size === 768);
  const lv = LEVELS[0];
  check('level 1 is 6×6', lv && lv.size === 6 && lv.r.length === 6 && lv.r[0].length === 6);
}

// ---- the tap cycle the phone actually uses ---------------------------------
{
  const lv = LEVELS[0];
  const regions = QNS.regionsOf(lv);
  let b = QNS.emptyBoard(lv.size);
  check('an empty board is not a win', QNS.checkWin(b, regions) === false);
  b = QNS.tap(b, regions, 0, 0, false);
  check('tap empty → X', b[0][0] === 'X');
  b = QNS.tap(b, regions, 0, 0, false);
  check('tap X → queen', b[0][0] === 'Q');
  b = QNS.tap(b, regions, 0, 0, false);
  check('tap queen → empty', b[0][0] == null);
}

// Auto X has to fill the row, column, region, and the eight neighbours —
// otherwise placing a queen on a phone is a chore of 20 extra taps.
{
  const lv = LEVELS[0];
  const regions = QNS.regionsOf(lv);
  let b = QNS.emptyBoard(lv.size);
  b = QNS.tap(b, regions, 0, 0, false);
  b = QNS.tap(b, regions, 0, 0, true);
  check('auto-X keeps the queen', b[0][0] === 'Q');
  check('auto-X fills the rest of the row', b[0].every((v, c) => c === 0 ? v === 'Q' : v === 'X'));
  check('auto-X fills the rest of the column', b.every((row, r) => r === 0 ? true : row[0] === 'X'));
  check('auto-X fills the neighbouring corner', b[1][1] === 'X');
}

// Two queens in one row must light a clash. Two that only share a long
// diagonal (not a neighbouring corner) must NOT — that is the rule that
// is not chess.
{
  const lv = LEVELS[0];
  const regions = QNS.regionsOf(lv);
  const n = lv.size;
  const b = QNS.emptyBoard(n);
  b[0][0] = 'Q';
  b[0][3] = 'Q';
  const clash = QNS.clashes(b, regions);
  check('two queens in a row clash', !!(clash['0,0'] && clash['0,3']));
  const d = QNS.emptyBoard(n);
  d[0][0] = 'Q';
  d[2][2] = 'Q';
  const far = QNS.clashes(d, regions);
  check('a long diagonal is not a clash', !far['0,0'] && !far['2,2']);
  const near = QNS.emptyBoard(n);
  near[0][0] = 'Q';
  near[1][1] = 'Q';
  const nClash = QNS.clashes(near, regions);
  check('a corner-touch is a clash', !!(nClash['0,0'] && nClash['1,1']));
}

// Drag-X must never overwrite a queen.
{
  const lv = LEVELS[0];
  const b = QNS.emptyBoard(lv.size);
  b[0][0] = 'Q';
  const next = QNS.paintX(b, [[0, 0], [0, 1]]);
  check('paintX leaves a queen alone', next[0][0] === 'Q' && next[0][1] === 'X');
}

// PLAY: solve level 1 with the same tap() the GIF runs. The placement is
// the unique (up to search order) solution the backtracker found; feeding
// it through tap+autoX and then checkWin is the loop a thumb plays.
{
  const lv = LEVELS[0];
  const regions = QNS.regionsOf(lv);
  const places = [[0, 0], [1, 3], [2, 5], [3, 2], [4, 4], [5, 1]];
  let b = QNS.emptyBoard(lv.size);
  for (const [r, c] of places) {
    b = QNS.tap(b, regions, r, c, false); // empty → X
    b = QNS.tap(b, regions, r, c, true);  // X → Q + auto X
  }
  check('level 1 is won after six queens', QNS.checkWin(b, regions) === true);
  check('level 1 has six queens', b.flat().filter((v) => v === 'Q').length === 6);
}

// A handful of larger boards must also be solvable under the same rules,
// or the 768-count is a pile of broken JSON.
function solve(level) {
  const n = level.size, regions = QNS.regionsOf(level), board = QNS.emptyBoard(n);
  const usedCol = Array(n).fill(false), usedReg = {};
  function adjOK(r, c) {
    for (const [dr, dc] of [[-1, -1], [-1, 1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && cc < n && board[rr][cc] === 'Q') return false;
    }
    return true;
  }
  function rec(r) {
    if (r === n) return true;
    for (let c = 0; c < n; c++) {
      const reg = regions[r][c];
      if (usedCol[c] || usedReg[reg]) continue;
      if (!adjOK(r, c)) continue;
      board[r][c] = 'Q'; usedCol[c] = true; usedReg[reg] = true;
      if (rec(r + 1)) return true;
      board[r][c] = null; usedCol[c] = false; delete usedReg[reg];
    }
    return false;
  }
  return rec(0) ? board : null;
}
{
  const sample = [0, 1, 70, 71, 280, 360, 500, 700, 767];
  let ok = 0;
  for (const i of sample) {
    const lv = LEVELS[i];
    const b = solve(lv);
    if (b && QNS.checkWin(b, QNS.regionsOf(lv))) ok++;
    else check('level ' + lv.id + ' (' + lv.size + '×' + lv.size + ') solves', false);
  }
  check('sampled boards across sizes all solve', ok === sample.length, { ok, n: sample.length });
}

// ---- shell: things a vm cannot click, grepped so they cannot rot ------------
const appJs = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const listing = fs.readFileSync(path.join(APP, 'listing.json'), 'utf8');
const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
const readme = fs.readFileSync(path.join(APP, 'README.md'), 'utf8');
const gameJs = fs.readFileSync(path.join(APP, 'game.js'), 'utf8');

check('in-progress board is RESTORED from gifos.db', /row\.board/.test(appJs) && /keep/.test(appJs));
check('onBack leaves play for the level list', /onBack/.test(appJs) && /goHome/.test(appJs));
check('room is subscribed so a guest sits the host puzzle', /subscribe/.test(appJs) && /puzzle/.test(appJs));
check('the board does not steal the page scroll (touch-action: none)', /touch-action:\s*none/.test(css));
check('cells are thumb-sized', /min-height:44px/.test(css));
check('no in-app Invite button', !/>\s*Invite\s*</.test(html) && !/id=["']invite/i.test(html));
check('app.js still tells the player to press Invite', /Invite/.test(appJs) || /Invite/.test(html));
check('listing does not claim LinkedIn', !/linkedin/i.test(listing));
check('help/readme/game do not claim LinkedIn', !/linkedin/i.test(help + readme + gameJs + appJs));
check('listing says finished boards are saved', /are saved/.test(listing));
check('help says what is saved', /stay in this file/.test(help) && /Auto X/.test(help));
check('save format still writes done/auto/cur/board/idx',
  /done:\s*save\.done/.test(appJs) && /board:\s*state\.board/.test(appJs) && /idx:\s*state\.idx/.test(appJs));
check('no analytics beacon', !/sendBeacon|gtag|plausible|vercel\.analytics/i.test(appJs + gameJs + html));

if (failures) {
  console.log('\n' + failures + ' FAIL');
  process.exit(1);
}
console.log('\nAll ' + (process.stdout.isTTY ? '' : '') + 'PASS');
process.exit(0);
