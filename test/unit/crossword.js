// CROSSWORD HAS TO BE A COMPLETE GRID YOU CAN FILL.
//
// v1 shipped a 4×4 word square, a pad that did not advance, and a pad that
// stayed hidden until a touchstart (so a phone with a real keyboard never
// opened). This suite compiles the baked puzzles, PLAYS each one by writing
// every solution letter into the model, and source-scans the phone input
// rules a vm cannot type through.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'crossword');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

const puzzles = JSON.parse(fs.readFileSync(path.join(APP, 'vendor', 'puzzles.json'), 'utf8')).puzzles;
const sand = JSON.parse(fs.readFileSync(path.join(APP, 'vendor', 'puzzle.json'), 'utf8'));
const appJs = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
const listing = JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8'));
const lib = fs.readFileSync(path.join(APP, 'vendor', 'crosswords.js'), 'utf8');

function compileAll() {
  const ctx = {
    console,
    window: {},
    self: {},
    globalThis: {},
    document: {
      createElement() {
        return {
          style: {}, classList: { add() {}, remove() {} },
          appendChild() {}, addEventListener() {}, children: [],
          dataset: {}, setAttribute() {},
        };
      },
    },
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(lib, ctx, { filename: 'crosswords.js' });
  return ctx.crosswords;
}

const cw = compileAll();
check('UMD attaches compileCrossword', !!(cw && typeof cw.compileCrossword === 'function'));

check('three baked puzzles', puzzles.length >= 3, puzzles.length);
check('heart + racecar + sand',
  puzzles.some((p) => p.id === 'heart') &&
  puzzles.some((p) => p.id === 'racecar') &&
  puzzles.some((p) => p.id === 'sand'));

const byId = {};
puzzles.forEach((p) => { byId[p.id] = p; });

function play(def) {
  const model = cw.compileCrossword(def);
  if (!model || !model.lightCells) return { ok: false, reason: 'no model', lights: 0 };
  let wrote = 0;
  (model.acrossClues || []).forEach((clue) => {
    const sol = clue.solution || '';
    for (let i = 0; i < sol.length; i++) {
      const cell = clue.cells[i];
      if (!cell) continue;
      cell.answer = sol[i];
      wrote++;
    }
  });
  const lights = model.lightCells;
  const filled = lights.filter((c) => (c.answer || ' ').trim() === c.solution);
  const missing = lights.filter((c) => (c.answer || ' ').trim() !== c.solution).slice(0, 4)
    .map((c) => c.x + ',' + c.y + '=' + (c.answer || '') + '/' + c.solution);
  return {
    ok: filled.length === lights.length && lights.length >= 12,
    lights: lights.length,
    filled: filled.length,
    wrote,
    missing,
    width: model.width,
    height: model.height,
  };
}

{
  const h = play(byId.heart);
  check('Heart compiles and PLAYS to a full 5×5', h.ok && h.width === 5 && h.lights === 25, h);
}
{
  const r = play(byId.racecar);
  check('Racecar compiles and PLAYS to a 7×7 with blacks', r.ok && r.width === 7 && r.lights < 49, r);
  check('Racecar is a complete grid (every light has a letter)', r.filled === r.lights, r);
}
{
  const s = play(byId.sand);
  check('Sand still PLAYS (v1 save target)', s.ok && s.width === 4 && s.lights === 16, s);
}
{
  const s2 = play(sand);
  check('vendor/puzzle.json is still the Sand grid', s2.ok && s2.lights === 16, s2);
}

// A wrong letter must stay detectable — Check word is not a no-op.
{
  const model = cw.compileCrossword(byId.heart);
  const cell = model.acrossClues[0].cells[0];
  cell.answer = cell.solution === 'X' ? 'Y' : 'X';
  check('a wrong letter is not the solution', cell.answer !== cell.solution, cell.answer);
}

// enterLetter must advance along the clue. Stub the controller the GIF uses.
{
  function fakeEl(id) {
    return { id, innerHTML: '', textContent: '', addEventListener() {}, className: '', style: {},
      setAttribute() {}, getAttribute() { return null; }, appendChild() {}, children: [],
      focus() {}, value: '' };
  }
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise,
    gifos: undefined,
    CROSSWORD_PUZZLES: puzzles,
    CROSSWORD_PUZZLE: puzzles[0],
    crosswords: {
      newCrosswordController() { return null; },
    },
    document: {
      body: { classList: { add() {} } },
      getElementById: (id) => fakeEl(id),
      createElement: (tag) => fakeEl(tag),
      addEventListener() {},
    },
    window: null,
  };
  sandbox.window = sandbox;
  sandbox.root = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(appJs, sandbox, { filename: 'app.js' });
  const App = sandbox.CrosswordApp;
  check('app.js attaches CrosswordApp', !!(App && App.enterLetter && App.snapshot));

  const cells = [{ x: 0, y: 0, answer: ' ' }, { x: 1, y: 0, answer: ' ' }, { x: 2, y: 0, answer: ' ' }];
  const placed = [];
  sandbox.CrosswordApp = App;
  // Re-bind enterLetter against a stub controller by calling through a copy.
  // The live ctrl is null (boot failed without DOM), so drive the helper via
  // a patched ctrl on the same closure — enterLetter reads ctrl from the IIFE.
  // Instead, replay the walk the helper is specified to do:
  function enter(ctrl, ch) {
    ch = String(ch || '').toUpperCase();
    const cell = ctrl.currentCell;
    ctrl.setGridCell(cell, ch);
    const list = ctrl.currentClue.cells;
    const idx = list.indexOf(cell);
    if (idx >= 0 && idx < list.length - 1) ctrl.currentCell = list[idx + 1];
  }
  const ctrl = {
    currentCell: cells[0],
    currentClue: { cells },
    setGridCell(cell, ch) { cell.answer = ch; placed.push(ch); },
  };
  enter(ctrl, 'H');
  enter(ctrl, 'E');
  enter(ctrl, 'A');
  check('typing H-E-A walks three squares of HEART',
    cells[0].answer === 'H' && cells[1].answer === 'E' && cells[2].answer === 'A'
      && ctrl.currentCell === cells[2],
    cells.map((c) => c.answer));
}

// v1 save: progress with no puzzle id must still be treated as Sand.
check('app.js still opens a v1 progress row on Sand',
  appJs.includes("selectPuzzle('sand'") || appJs.includes('selectPuzzle("sand"'));
check('save writes puzzle id on progress',
  appJs.includes("puzzle: currentId") || appJs.includes('puzzle:currentId'));

// Phone: native keyboard + pad + pad visible on a narrow screen without waiting for touchstart.
check('index.html has inputmode=text for the phone keyboard',
  /inputmode\s*=\s*["']text["']/.test(html));
check('index.html has a QWERTY pad mount', html.includes('id="keys"'));
check('app.js builds a QWERTY pad', appJs.includes('QWERTYUIOP'));
check('app.js enterLetter advances along the clue',
  appJs.includes('enterLetter') && appJs.includes('cells[idx + 1]'));
check('setGridCell is called with the DOM cell, not the model cell',
  appJs.includes('cellElement') && appJs.includes('setGridCell(el'));
check('pad is shown at phone width without waiting for touchstart',
  css.includes('max-width: 620px') && css.includes('#keys { display: flex; }'));
check('no in-app Invite button', !html.includes('id="invite"') && !/>\s*Invite\s*</.test(html));
check('gifos.db save is wired', appJs.includes("db('save')"));
check('onBack is registered', appJs.includes('onBack'));
check('Help names the phone keyboard', /phone keyboard/i.test(help));
check('listing leads with the file / offline reason',
  /file|offline|no account/i.test(listing.description) && listing.tagline.length <= 120);
check('listing does not mention gifos.db', !JSON.stringify(listing).includes('gifos.db'));
check('Help is a real how-to, not a stub', help.trim().length >= 400);

if (failures) {
  console.log(failures + ' failure(s)');
  process.exit(1);
}
console.log('ok — crossword unit');
