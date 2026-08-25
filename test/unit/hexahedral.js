// HEXAHEDRAL HAS TO ACTUALLY SLIDE, AND A LEVEL HAS TO BE WINNABLE.
//
// The 1.0 port was a square-swipe on an isometric field (the cube jumped
// the wrong way on a phone), saved only the level number (no bests), and
// wrapped the last jam level back to Easy. This suite PLAYS the shipped
// engine: one slide, a real win of level 1, isometric drag mapping, a 1.0
// save still loading, and a campaign that ends. DOM wiring a vm cannot run
// is source-scanned.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'hexahedral');
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

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
  vm.runInContext(read('levels.js'), sandbox, { filename: 'levels.js' });
  vm.runInContext(read('game.js'), sandbox, { filename: 'game.js' });
  return sandbox;
}

const S = load();
const HEX = S.HEX;
check('levels.js and game.js load and attach HEX', !!(HEX && HEX.create && HEX.moveTo && HEX.isoDir));
check('all 30 jam levels are aboard', HEX.count === 30 && (S.HEX_LEVELS || []).length === 30, HEX.count);

{
  const L = HEX.first;
  check('level 1 is a 2×2 with 3 moves', L && L.tiles.length === 2 && L.tiles[0].length === 2 && L.maxMoves === 3);
  check('the player starts on a down tile', L.tiles[L.playerPosition.row][L.playerPosition.column] === '_');
}

// ---- a slide has to put the cube on a neighbour ---------------------------
{
  const s = HEX.create();
  HEX.loadLevel(s, 0);
  const p0 = { row: s.player.row, column: s.player.column };
  const res = HEX.move(s, 0, -1);
  check('a legal slide is accepted', res.ok === true, res);
  check('the cube MOVES onto the neighbour', s.player.row === p0.row && s.player.column === p0.column - 1,
    { from: p0, to: s.player });
  check('the tile it stepped on toggles', s.tiles[0][0] === '_');
  check('a broken tile refuses the cube', HEX.moveTo(HEX.loadLevel(HEX.create(), 1), 1, 1).ok === false);
  check('a jump of two tiles is refused', HEX.moveTo(HEX.loadLevel(HEX.create(), 0), 1, 0).ok === false);
}

// ---- PLAY: clear level 1 with the same moveTo the GIF runs ----------------
{
  const s = HEX.create();
  HEX.loadLevel(s, 0);
  check('a fresh board is not a win', HEX.remaining(s) === 3);
  const path = [[0, 0], [1, 0], [1, 1]];
  let last = null;
  for (const [r, c] of path) last = HEX.moveTo(s, r, c);
  check('level 1 is won in three slides', last && last.ok && last.won && !last.lost, last);
  check('no pinks remain', HEX.remaining(s) === 0);
  check('the best for level 1 is 3', s.bests[0] === 3, s.bests[0]);
  check('a win on level 1 is not the campaign', last.cleared === false);
}

// ---- isometric drag maps to the cube faces, not the screen axes -----------
{
  const se = HEX.isoDir(40, 40);
  const sw = HEX.isoDir(-40, 40);
  const nw = HEX.isoDir(-40, -40);
  const ne = HEX.isoDir(40, -40);
  check('swipe down-right is +column', se && se.dRow === 0 && se.dCol === 1, se);
  check('swipe down-left is +row', sw && sw.dRow === 1 && sw.dCol === 0, sw);
  check('swipe up-left is −column', nw && nw.dRow === 0 && nw.dCol === -1, nw);
  check('swipe up-right is −row', ne && ne.dRow === -1 && ne.dCol === 0, ne);
  check('a tap is not a swipe', HEX.isoDir(4, 3) == null);
  const drag = HEX.isoDrag(80, 80, 48);
  check('a drag along a face slides the cube partway', drag && drag.dCol > 0.4 && drag.dRow === 0, drag);
}

{
  const s = HEX.create();
  HEX.loadLevel(s, 0);
  HEX.moveTo(s, 0, 0);
  HEX.moveTo(s, 1, 0);
  check('undo takes the cube back a step', HEX.undo(s) && s.player.row === 0 && s.player.column === 0 && s.moves === 1);
  HEX.undo(s);
  check('undo back to the start', s.player.column === 1 && s.moves === 0 && s.status === 'playing');
}

{
  const s = HEX.create();
  HEX.applySave(s, { id: 'progress', level: 4, maxReached: 4 });
  check('a 1.0 save (no bests) still loads the level', s.view === 'play' && s.level === 4 && s.maxReached === 4);
  check('…and does not invent bests', s.bests[4] == null);
  const rec = HEX.toSave(s);
  check('a new save writes bests and the view', Array.isArray(rec.bests) && rec.bests.length === 30 && rec.view === 'play' && rec.id === 'progress');
  const s2 = HEX.create();
  HEX.applySave(s2, { id: 'progress', level: 7, maxReached: 11, bests: [3, 4], view: 'menu' });
  check('bests + menu view round-trip', s2.view === 'menu' && s2.bests[0] === 3 && s2.maxReached === 11 && s2.level === 7);
}

{
  const s = HEX.create();
  HEX.loadLevel(s, 29);
  check('the last jam level loads', s.level === 29 && s.view === 'play');
  const end = HEX.loadLevel(s, 30);
  check('past the last level is a cleared campaign, not a wrap to Easy', end.view === 'cleared' && end.status === 'cleared' && end.level === 29, end.view);
  const win = HEX.create();
  HEX.loadLevel(win, 0);
  HEX.moveTo(win, 0, 0);
  HEX.moveTo(win, 1, 0);
  const last = HEX.moveTo(win, 1, 1);
  check('winning a mid level is not cleared', last.cleared === false);
}

{
  const s = HEX.create();
  HEX.loadLevel(s, 0);
  s.status = 'won';
  check('a won board refuses another slide', HEX.move(s, 1, 0).ok === false);
  HEX.loadLevel(s, 0);
  s.status = 'lost';
  check('a lost board refuses another slide', HEX.move(s, 0, -1).ok === false);
}

// ---- the shell a vm cannot click ------------------------------------------
{
  const app = read('app.js');
  const css = read('style.css');
  const html = read('index.html');
  const help = read('help.md');
  const listing = read('listing.json');
  check('the field captures a pointer so a drag actually slides',
    /pointerdown/.test(app) && /setPointerCapture/.test(app) && /isoDrag/.test(app) && /isoDir/.test(app));
  check('the field does not yield the gesture to the page', /touch-action:\s*none/.test(css));
  check('a [hidden] menu button stays hidden (display:block must not leak Resume)',
    /button\[hidden\]\s*\{\s*display:\s*none/.test(css));
  check('a diamond pad is there for a thumb after the first touch',
    /id="pad"/.test(html) && /touchstart/.test(app) && /data-dr/.test(html));
  check('the save writes bests through gifos.db(\'save\')',
    /db\('save'\)/.test(app) && /toSave/.test(app) && /bests/.test(read('game.js')));
  check('Back leaves the field for the menu', /onBack/.test(app) && /view = 'menu'/.test(app));
  check('won and lost are real overlays, not a silent wrap',
    /data-act="next"/.test(app) && /Out of moves/.test(app) && /cleared/.test(app));
  check('no in-app Invite', !/>\s*Invite\s*</.test(html) && !/id=["']invite/i.test(html));
  check('help.md covers drag, arrows, undo, and what is saved',
    /Drag/i.test(help) && /Arrow/i.test(help) && /Undo/i.test(help) && /best/i.test(help) && !/gifos\.db/.test(help));
  check('listing says the level you reached is saved',
    /best moves are saved/.test(listing) && !/gifos\.db/.test(listing) && !/\bdrop\b/.test(listing));
  check('game.js is a classic script in the GIF', /src="game.js"/.test(html) && !/export /.test(read('game.js')));
}

if (failures) {
  console.log(failures + ' failure(s)');
  process.exit(1);
}
console.log('ok');
