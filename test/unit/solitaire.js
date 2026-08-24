// SOLITAIRE HAS TO ACTUALLY PLAY KLONDIKE.
//
// The 1.0 port shuffled with Array.sort(Math.random) (biased), had no undo,
// no draw-1, no score, and tap-to-move was the only phone path. This suite
// PLAYS the shipped engine: deal, legal moves, draw, recycle, undo, a win,
// and a 1.0 save still loading. DOM wiring a vm cannot run is source-scanned.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'solitaire');
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function load() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('klondike.js'), sandbox, { filename: 'klondike.js' });
  return sandbox.Klondike;
}

const K = load();
check('klondike.js attaches Klondike', !!(K && K.newGame && K.applyMove && K.undo));

{
  const s = K.newGame(seeded(0x51A7));
  check('a deal is 52 cards', s.cards.length === 52);
  const dealt = s.desk.reduce((n, c) => n + c.length, 0);
  check('Klondike deal: 28 on the tableau, 24 in the stock', dealt === 28 && s.pile.length === 24 && s.waste.length === 0,
    { dealt: dealt, pile: s.pile.length });
  check('seven columns, 1..7 cards', s.desk.map((c) => c.length).join(',') === '1,2,3,4,5,6,7');
  let up = 0;
  s.desk.forEach((col) => { const i = col[col.length - 1]; if (s.cards[i].facingUp) up++; });
  check('each column has its top card face-up (7 showing)', up === 7, up);
  const two = K.newGame(seeded(0x51A7));
  const same = JSON.stringify(K.snapshot(s).cards) === JSON.stringify(K.snapshot(two).cards);
  check('the same seed deals the same tableau', same);
  const other = K.newGame(seeded(0xBEEF));
  check('a different seed deals a different tableau',
    JSON.stringify(K.snapshot(s).cards) !== JSON.stringify(K.snapshot(other).cards));
}

check('QH sits on KS (red on black, one rank down)', K.canPlace(12, 'h', 13, 's'));
check('QH does not sit on KH (same colour)', !K.canPlace(12, 'h', 13, 'h'));
check('only a king fills an empty column', K.kingOnEmpty(13) && !K.kingOnEmpty(12));
check('only an ace starts a foundation', K.aceOnFoundation(1) && !K.aceOnFoundation(2));

function blank() {
  const s = K.empty();
  s.pile = [];
  s.waste = [];
  s.desk = [[], [], [], [], [], [], []];
  s.finish = [[], [], [], []];
  return s;
}

{
  const s = blank();
  s.cards[0].facingUp = true; // AC
  s.waste = [0];
  const moved = K.tap(s, 0);
  check('tapping the ace of clubs sends it to a foundation',
    !!(moved && moved.dest === 'finish' && s.finish[moved.pile][0] === 0 && s.waste.length === 0), moved);
  check('…and scores +10', s.score === 10, s.score);
}

{
  const s = blank();
  s.cards[51].facingUp = true; // KS
  s.desk[0] = [51];
  const ok = K.applyMove(s, 51, { dest: 'desk', pile: 2 });
  check('a king may move to an empty column', ok && s.desk[2][0] === 51 && s.desk[0].length === 0);
  const again = K.tapDests(s, 51).some((d) => d.dest === 'desk' && s.desk[d.pile].length === 0);
  check('tap will not shuffle a king between empty columns', !again);
}

{
  const s = blank();
  s.cards[51].facingUp = true; // KS
  s.cards[37].facingUp = true; // QH  (hearts queen: 2*13+11)
  s.desk[0] = [51];
  s.desk[1] = [37];
  check('QH on KS is legal', K.applyMove(s, 37, { dest: 'desk', pile: 0 }) && s.desk[0].join(',') === '51,37');
}

{
  const s = blank();
  s.cards[38].facingUp = true; // KH
  s.cards[24].facingUp = true; // QD
  s.desk[0] = [38];
  s.desk[1] = [24];
  check('QD on KH is refused (both red)', !K.applyMove(s, 24, { dest: 'desk', pile: 0 }));
}

{
  const s = blank();
  s.pile = [10, 11, 12, 13];
  s.draw = 3;
  K.draw(s);
  check('draw 3 turns three cards, last drawn on top of the waste',
    s.pile.join(',') === '10' && s.waste.join(',') === '13,12,11' && s.cards[11].facingUp,
    { pile: s.pile, waste: s.waste });
  s.draw = 1;
  s.pile = [8, 9];
  s.waste = [];
  K.draw(s);
  check('draw 1 turns a single card', s.waste.join(',') === '9' && s.pile.join(',') === '8');
}

{
  const s = blank();
  s.waste = [1, 2, 3];
  s.cards[1].facingUp = s.cards[2].facingUp = s.cards[3].facingUp = true;
  s.draw = 3;
  s.score = 50;
  K.recycle(s);
  check('recycle flips the waste: oldest card is the next draw',
    s.waste.length === 0 && s.pile.join(',') === '3,2,1' && !s.cards[1].facingUp,
    { pile: s.pile });
  s.draw = 1;
  K.draw(s);
  check('…so the first card after a recycle is the oldest waste card',
    s.waste[s.waste.length - 1] === 1, s.waste);
  check('draw-3 recycle costs 20', s.score === 30, s.score);
}

{
  const s = blank();
  s.cards[0].facingUp = true;
  s.waste = [0];
  K.tap(s, 0);
  const score = s.score, moves = s.moves;
  check('undo is available after a move', s.history.length === 1);
  K.undo(s);
  check('undo restores the ace to the waste and the score',
    s.waste[0] === 0 && s.finish[0].length === 0 && s.score === 0 && s.moves === 0,
    { waste: s.waste, score: s.score, moves: s.moves, prev: { score: score, moves: moves } });
}

{
  const s = blank();
  s.finish = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
    [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38],
    [39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51],
  ];
  check('four kings on the foundations is a win', K.checkWin(s) === true && s.won);
}

{
  const s = blank();
  s.cards[0].facingUp = true;
  s.cards[1].facingUp = true;
  s.finish[0] = [0];
  s.waste = [1]; // 2♣
  check('auto-complete walks a 2 onto its ace', K.autoStep(s) && s.finish[0].join(',') === '0,1');
}

{
  // A 1.0 save: no draw/score/moves/elapsed. Must still load the tableau.
  const s0 = K.newGame(seeded(7));
  const rec = {
    id: 'game',
    cards: s0.cards.map((c) => ({ type: c.type, number: c.number, facingUp: c.facingUp })),
    desk: s0.desk.map((d) => d.slice()),
    finish: s0.finish.map((d) => d.slice()),
    pile: s0.pile.slice(),
    waste: s0.waste.slice()
  };
  const loaded = K.restore(rec);
  check('a 1.0 save (no draw/score) still restores',
    !!(loaded && loaded.cards.length === 52 && loaded.draw === 3 && loaded.desk[6].length === 7),
    loaded && { draw: loaded.draw, col6: loaded.desk[6].length });
  const snap = K.snapshot(loaded);
  check('a round-trip snapshot still has id:game and 52 cards',
    snap.id === 'game' && snap.cards.length === 52 && Array.isArray(snap.desk));
}

{
  const s = blank();
  s.cards[0].facingUp = true;
  s.waste = [0];
  const h = K.hint(s);
  check('hint points at the ace that can go up', !!(h && h.card === 0 && h.dest && h.dest.dest === 'finish'), h);
}

const app = read('app.js');
const html = read('index.html');
const css = read('style.css');
const help = read('help.md');
const listing = JSON.parse(read('listing.json'));
const manifest = JSON.parse(read('manifest.json'));

check('shuffle is Fisher–Yates, not Array.sort(random)',
  read('klondike.js').includes('fisherYates') &&
  !/Math\.random\(\)\s*<\s*0\.5/.test(read('klondike.js') + app));
check('undo is in the engine AND on a 44px bar button',
  html.includes('id="undo"') && /min-height:44px/.test(css.replace(/\s+/g, '')));
check('draw 1/3 is a real toggle, saved on the snapshot',
  html.includes('id="drawN"') && /s\.draw = s\.draw === 3 \? 1 : 3/.test(app));
check('tap-to-move uses tapDests (foundation first, then a second tap if several homes)',
  app.includes('tapDests') && app.includes('tryTap'));
check('drag uses a movement threshold, not a 180ms long-press',
  /dx \* dx \+ dy \* dy > 64/.test(app) && !/setTimeout\([^,]+,\s*180\)/.test(app));
check('a mouse click is a tap (drag arms only after 8px, never on pointerdown)',
  !/if\s*\(\s*mouse\s*\)\s*arm\(\)/.test(app));
check('onBack undoes (or cancels a selection / new-game ask)',
  /onBack/.test(app) && /doUndo/.test(app));
check('old saves still load through restore()', app.includes('K.restore') && app.includes("get('game')"));
check('no in-app Invite button', !/>\s*Invite\s*</.test(html) && !/id=["']invite/i.test(html));
check('help covers undo, draw 1 or 3, and tap-to-move',
  /undo/i.test(help) && /draw/i.test(help) && /tap/i.test(help));
check('listing leads with offline / file is the save / no account',
  /offline/i.test(listing.description) && /file is the save/i.test(listing.description) &&
  /no account/i.test(listing.description));
check('listing tagline fits a card', listing.tagline.length <= 80);
check('author is rjanjic, porter GifOS', listing.author.name === 'rjanjic' && listing.porter.name === 'GifOS');
check('one-player: no multiplayer capability', !manifest.capabilities.multiplayer);
check('minBuild stays 947', manifest.minBuild === 947);
check('no CDN / webfont / remote at load',
  !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')) && !/@import|fonts\.google/i.test(css));
check('classic scripts only', !/type=["']module["']/.test(html));
check('face-up pips nested in a face-down parent stay visible',
  /\.card--back\s*>\s*\.pip/.test(css) && !/\.card--back\s+\.pip\s*\{/.test(css));
check('phone overlap leaves ranks readable',
  /@media \(max-width:420px\)[\s\S]*top:15px/.test(css.replace(/\s+/g, '')) ||
  /max-width:420px[\s\S]{0,200}top:\s*15px/.test(css));

if (failures) {
  console.log('\n' + failures + ' fail');
  process.exit(1);
}
console.log('\nsolitaire unit: all PASS');
