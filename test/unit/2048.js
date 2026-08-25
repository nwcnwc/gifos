// 2048 HAS TO KEEP THE GAME YOU JUST LEFT.
//
// Upstream 2048 holds ONE game state and "New Game" overwrites it, so the board
// you reached 4096 on is gone the instant you deal the next one. This suite
// plays REAL games through the shipped vendor GameManager on top of the shipped
// storage/archive, and pins the three things that made that bug possible:
//
//   1. New Game must OPEN a row, never overwrite one.
//   2. The board that ends a lost game must reach disk — upstream's actuate()
//      calls clearGameState() the moment `over` is true, so the last position
//      you ever saw is the one it never saves.
//   3. Nothing but remove() may drop a played game. No cap, no expiry, no
//      "keep the last N".
//
// Plus: the archive survives a reload, resuming is lossless in BOTH directions,
// friend-mode never touches the solo archive, and the pre-archive save migrates
// instead of dying.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', '2048');
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

// ---- a db that behaves like gifos.db('save'): one collection, keyed by id ----
function fakeDb() {
  const rows = new Map();
  const api = {
    rows,
    getAll: () => Promise.resolve([...rows.values()].map((r) => JSON.parse(JSON.stringify(r)))),
    put: (rec) => { rows.set(rec.id, JSON.parse(JSON.stringify(rec))); return Promise.resolve(rec); },
    delete: (id) => { rows.delete(id); return Promise.resolve(true); },
  };
  return api;
}

// ---- boot the app the way index.html does, minus the DOM ----------------
// hist.js and storage.js are pure; the vendor engine needs only Grid/Tile.
// The actuator and input manager are stubs — this suite is about the SAVE,
// and the panel's own wiring is source-scanned at the bottom.
function boot(db, opts) {
  opts = opts || {};
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise, TypeError,
    setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.gifos = { db: () => db };
  const listeners = {};
  sandbox.addEventListener = (n, fn) => { (listeners[n] = listeners[n] || []).push(fn); };
  sandbox.fire = (n) => (listeners[n] || []).forEach((fn) => fn());
  vm.createContext(sandbox);
  for (const f of ['vendor/grid.js', 'vendor/tile.js', 'hist.js', 'storage.js', 'vendor/game_manager.js']) {
    vm.runInContext(read(f), sandbox, { filename: f });
  }
  // The two seams app.js installs, replayed here without the DOM half.
  vm.runInContext(`
    var origActuate = GameManager.prototype.actuate;
    GameManager.prototype.actuate = function () {
      if (this.over && !window.G2048.mp && LocalStorageManager.finalize) {
        LocalStorageManager.finalize(this.serialize());
      }
      origActuate.call(this);
    };
  `, sandbox);
  vm.runInContext(`
    function Actuator() {}
    Actuator.prototype.actuate = function () {};
    Actuator.prototype.continueGame = function () {};
    function Input() { this.handlers = {}; }
    Input.prototype.on = function (e, fn) { (this.handlers[e] = this.handlers[e] || []).push(fn); };
  `, sandbox);
  return sandbox;
}

function newGameManager(s) {
  return vm.runInContext('window.G2048.game = new GameManager(4, Input, Actuator, LocalStorageManager)', s);
}

// Writes are debounced 200 ms (a move must not cost a db round trip), so a
// db assertion has to outwait the timer.
const settle = () => new Promise((r) => setTimeout(r, 300));

// Slide until something moves. Deterministic enough to build real histories.
function playMoves(game, n) {
  let made = 0;
  for (let i = 0; i < n * 8 && made < n; i++) {
    const before = JSON.stringify(game.serialize().grid.cells);
    game.move(i % 4);
    if (JSON.stringify(game.serialize().grid.cells) !== before) made++;
    if (game.over) break;
  }
  return made;
}

// ---- boot mp.js against a paper DOM -------------------------------------
// The race bar is pure string-building off a room snapshot, so it needs no
// browser — only the six ids it reaches for and a room whose subscribe()
// callback we can pull. show() sets the local board, feeds a snapshot, and
// hands back what the bar now reads.
function bootMp() {
  const node = () => ({
    textContent: '', innerHTML: '', hidden: false,
    classList: { add() {}, remove() {} },
    addEventListener() {}, getElementsByTagName: () => [{ textContent: '' }],
  });
  const nodes = {};
  for (const id of ['friend-status', 'friend-scores', 'againBtn', 'friend-bar', 'friendBtn', 'leaveBtn']) {
    nodes[id] = node();
  }
  const game = {
    score: 0, won: false, over: false, grid: { eachCell() {} },
    resetBoard() {}, setup() {}, actuator: { continueGame() {} },
  };
  let feed = null;
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise,
    setInterval: () => 0, clearInterval() {},
    document: {
      getElementById: (id) => nodes[id],
      querySelector: () => node(),
      body: { classList: { add() {}, remove() {} } },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.G2048 = { game };
  sandbox.gifos = {
    db: () => ({ put: () => Promise.resolve(), delete: () => Promise.resolve(), subscribe: (fn) => { feed = fn; } }),
    me: () => Promise.resolve({ id: 'aaa', name: 'You' }),
  };
  vm.createContext(sandbox);
  vm.runInContext(read('mp.js'), sandbox, { filename: 'mp.js' });
  sandbox.G2048.Mp.enter();
  return {
    ready: () => new Promise((r) => setTimeout(r, 0)),
    show(board, list) {
      Object.assign(game, board);
      feed(list);
      return {
        status: nodes['friend-status'].textContent || nodes['friend-status'].innerHTML,
        scores: nodes['friend-scores'].innerHTML,
      };
    },
  };
}

function gameRows(db) {
  return [...db.rows.values()].filter((r) => r.kind === 'game');
}

(async function main() {
  // ---- the pure archive helpers ------------------------------------------
  {
    const s = boot(fakeDb());
    const H = s.window.G2048.Hist;
    // grid.cells is cells[x][y] with x the COLUMN. A naive flatten transposes
    // the board, which would draw every preview mirrored down the diagonal.
    const state = {
      grid: { size: 2, cells: [[{ value: 2 }, { value: 8 }], [{ value: 4 }, null]] },
      score: 12, over: false, won: false, keepPlaying: false,
    };
    check('previewCells reads row-major, not transposed',
      JSON.stringify(H.previewCells(state)) === JSON.stringify([2, 4, 8, 0]),
      H.previewCells(state));
    check('maxTile is the biggest tile on the board', H.maxTile(state) === 8);
    check('tileCount counts occupied cells', H.tileCount(state) === 3);
    check('signature changes with the score even on the same cells',
      H.signature(state) !== H.signature(Object.assign({}, state, { score: 13 })));
    const now = Date.UTC(2026, 7, 24, 12, 0, 0);
    check('relTime says "earlier" for a game with no timestamp — never 1970',
      H.relTime(null, now) === 'earlier' && H.relTime(0, now) === 'earlier');
    check('relTime is relative up to a week',
      H.relTime(now - 30000, now) === 'just now' &&
      H.relTime(now - 5 * 60000, now) === '5 min ago' &&
      H.relTime(now - 3 * 3600000, now) === '3 hours ago' &&
      H.relTime(now - 30 * 3600000, now) === 'yesterday' &&
      H.relTime(now - 4 * 86400000, now) === '4 days ago');
    check('relTime dates anything older, and carries the year across new year',
      /^[A-Z][a-z]{2} \d+$/.test(H.relTime(now - 20 * 86400000, now)) &&
      /, 2025$/.test(H.relTime(Date.UTC(2025, 4, 2), now)));
    check('status names the three ends a game can have',
      H.status({ state: { over: true } }) === 'finished' &&
      H.status({ state: { won: true, keepPlaying: false } }) === 'won' &&
      H.status({ state: {} }) === 'in play');
    check('persistable drops the derived fields and keeps the move count',
      (() => {
        const p = H.persistable({ id: 'x', state, score: 12, max: 8, moves: 7, startedAt: 1, updatedAt: 2, sig: 'q', cellsSig: 'q' });
        return p.sig === undefined && p.cellsSig === undefined && p.moves === 7 && p.kind === 'game';
      })());
  }

  // ---- THE BUG: New Game must not eat the board you were on ---------------
  {
    const db = fakeDb();
    const s = boot(db);
    await vm.runInContext('LocalStorageManager.load()', s);
    const hist = s.window.G2048.hist;
    const game = newGameManager(s);

    playMoves(game, 12);
    const first = hist.currentId();
    const firstScore = hist.get(first).score;
    const firstCells = JSON.stringify(game.serialize().grid.cells);
    check('a game is in the archive from the first move', !!first && hist.count() === 1);

    game.restart();
    playMoves(game, 6);
    const second = hist.currentId();
    check('New Game opens a SECOND row instead of overwriting the first',
      second !== first && hist.count() === 2, { first, second, count: hist.count() });
    check('the game you left still has its score and its board',
      hist.get(first).score === firstScore &&
      JSON.stringify(hist.get(first).state.grid.cells) === firstCells);

    // ...and going back is lossless the other way too.
    const secondCells = JSON.stringify(game.serialize().grid.cells);
    const resumed = hist.resume(first);
    game.actuator.continueGame();
    game.setup();
    check('resuming an old game puts that exact board back on the table',
      JSON.stringify(game.serialize().grid.cells) === firstCells && !!resumed);
    check('the game you stepped away from is untouched by the switch',
      JSON.stringify(hist.get(second).state.grid.cells) === secondCells);
    check('switching back and forth never creates a third game', hist.count() === 2);

    hist.resume(second);
    game.setup();
    check('and the other direction restores it exactly',
      JSON.stringify(game.serialize().grid.cells) === secondCells);
  }

  // ---- boards nobody played are not games ---------------------------------
  {
    const db = fakeDb();
    const s = boot(db);
    await vm.runInContext('LocalStorageManager.load()', s);
    const hist = s.window.G2048.hist;
    const game = newGameManager(s);
    playMoves(game, 3);
    game.restart();
    game.restart();
    game.restart();
    // One played game, plus the deal now on the table. The two unplayed boards
    // in between left no trace.
    check('hammering New Game does not litter history with unplayed deals',
      hist.count() === 2, hist.games().map((g) => g.moves));
    check('exactly one of them is a game somebody actually played',
      hist.games().filter((g) => g.moves > 0).length === 1 &&
      hist.games().filter((g) => g.moves > 0)[0].moves >= 3);
  }

  // ---- the losing board has to reach disk ---------------------------------
  {
    const db = fakeDb();
    const s = boot(db);
    await vm.runInContext('LocalStorageManager.load()', s);
    const hist = s.window.G2048.hist;
    const game = newGameManager(s);
    // Cycle the four directions until the board is genuinely dead. This is a
    // real game played to its real end, not a hand-placed corpse.
    let guard = 0;
    while (!game.over && guard < 20000) game.move(guard++ % 4);
    check('the board really did fill up', game.over === true, guard);
    const row = hist.games()[0];
    check('the final, LOST board is the one archived — not the move before it',
      row.state.over === true && JSON.stringify(row.state.grid.cells) === JSON.stringify(game.serialize().grid.cells));
    check('a lost game is still in history', hist.count() === 1 && row.score > 0 && row.moves > 10);
    check('...and the app lets go of it, so the next boot deals fresh',
      hist.currentId() === null && hist.state() === null);
    await settle();
    check('the lost game reached the db, not just memory',
      gameRows(db).length === 1 && gameRows(db)[0].state.over === true);
  }

  // ---- it survives a reload ----------------------------------------------
  {
    const db = fakeDb();
    const s1 = boot(db);
    await vm.runInContext('LocalStorageManager.load()', s1);
    const g1 = newGameManager(s1);
    playMoves(g1, 10);
    g1.restart();
    playMoves(g1, 5);
    s1.fire('pagehide');
    await settle();
    const liveId = s1.window.G2048.hist.currentId();
    const liveCells = JSON.stringify(g1.serialize().grid.cells);
    const best = g1.storageManager.getBestScore();

    const s2 = boot(db);
    await vm.runInContext('LocalStorageManager.load()', s2);
    const hist2 = s2.window.G2048.hist;
    const g2 = newGameManager(s2);
    check('both games come back after a reload', hist2.count() === 2);
    check('the game in progress is still the one on the table',
      hist2.currentId() === liveId && JSON.stringify(g2.serialize().grid.cells) === liveCells);
    check('best score comes back too', g2.storageManager.getBestScore() === best && best > 0);
    check('re-opening the app does not count as a move',
      hist2.get(liveId).moves === s1.window.G2048.hist.get(liveId).moves);
  }

  // ---- only YOU delete a game --------------------------------------------
  {
    const db = fakeDb();
    const s = boot(db);
    await vm.runInContext('LocalStorageManager.load()', s);
    const hist = s.window.G2048.hist;
    const game = newGameManager(s);
    for (let i = 0; i < 12; i++) { if (i) game.restart(); playMoves(game, 4); }
    check('twelve games played, twelve games kept — there is no cap',
      hist.count() === 12, hist.count());
    const ids = hist.games().map((g) => g.id);
    hist.remove(ids[3]);
    check('remove() drops exactly one', hist.count() === 11 && !hist.get(ids[3]));
    check('...and it is gone from the db as well', gameRows(db).length === 11);
    check('remove() of an unknown id is a no-op', hist.remove('nope') === false && hist.count() === 11);
    check('the list is newest-first',
      hist.games().every((g, i, a) => i === 0 || (a[i - 1].updatedAt || 0) >= (g.updatedAt || 0)));
  }

  // ---- the pre-archive save is migrated, not lost -------------------------
  {
    const db = fakeDb();
    const cells = [[{ position: { x: 0, y: 0 }, value: 4096 }, null, null, null], [null, null, null, null], [null, null, null, null], [null, null, null, null]];
    await db.put({ id: 'best', score: 99999 });
    await db.put({ id: 'game', state: { grid: { size: 4, cells }, score: 77777, over: false, won: true, keepPlaying: true } });
    const s = boot(db);
    await vm.runInContext('LocalStorageManager.load()', s);
    const hist = s.window.G2048.hist;
    const game = newGameManager(s);
    check('the old single save becomes the first game in the archive',
      hist.count() === 1 && hist.games()[0].max === 4096 && hist.games()[0].score === 77777);
    check('and it is still the game on the table',
      game.score === 77777 && hist.currentId() === hist.games()[0].id);
    check('a migrated game has no invented start time', hist.games()[0].startedAt === null);
    await settle();
    check('the legacy row is retired so it cannot migrate twice',
      !db.rows.has('game') && gameRows(db).length === 1);
    check('best score is untouched by the migration', game.storageManager.getBestScore() === 99999);
  }

  // ---- a race is not a game you played alone ------------------------------
  {
    const db = fakeDb();
    const s = boot(db);
    await vm.runInContext('LocalStorageManager.load()', s);
    const hist = s.window.G2048.hist;
    const game = newGameManager(s);
    playMoves(game, 8);
    const soloId = hist.currentId();
    const soloCells = JSON.stringify(hist.get(soloId).state.grid.cells);
    const soloMoves = hist.get(soloId).moves;

    s.window.G2048.mp = true;
    game.storageManager.setGameState(game.serialize());
    game.storageManager.clearGameState();
    vm.runInContext('LocalStorageManager.finalize({ grid: { size: 4, cells: [[null,null,null,null],[null,null,null,null],[null,null,null,null],[null,null,null,null]] }, score: 1, over: true })', s);
    check('friend-mode writes nothing into the solo archive',
      hist.count() === 1 && hist.get(soloId).moves === soloMoves &&
      JSON.stringify(hist.get(soloId).state.grid.cells) === soloCells);
    check('...and does not let go of the solo game either',
      hist.currentId() === soloId && game.storageManager.getGameState() === null);
    s.window.G2048.mp = false;
    check('leaving the race hands the solo board straight back',
      JSON.stringify(game.storageManager.getGameState().grid.cells) === soloCells);
  }

  // ---- deleting the game under your hands ---------------------------------
  {
    const db = fakeDb();
    const s = boot(db);
    await vm.runInContext('LocalStorageManager.load()', s);
    const hist = s.window.G2048.hist;
    const game = newGameManager(s);
    playMoves(game, 6);
    const id = hist.currentId();
    hist.remove(id);
    check('deleting the current game lets go of it', hist.currentId() === null && hist.count() === 0);
    game.restart();
    playMoves(game, 4);
    check('the next game is a NEW row, not the deleted one resurrected',
      hist.count() === 1 && hist.currentId() !== id);
  }

  // ---- one score, printed once -------------------------------------------
  // The race bar is the scoreboard: every live score, ranked, with its highest
  // tile. The status line beside it exists to say what the list CANNOT — press
  // Invite, you are out, why the round ended — and the heading's Score/Best
  // pair stands down. It shipped saying "Kim is on 1,000." beside a chip that
  // already read 1,000, and tagging a 2048 winner "2048" next to a chip that
  // said 2048. Every state below is checked for a number said twice.
  {
    const mp = bootMp();
    await mp.ready();   // enter() subscribes only after me() resolves
    const t = Date.now();
    const row = (o) => Object.assign(
      { seed: 1, round: 1, score: 0, hash: 'x', max: 0, won: false, over: false, at: t }, o);
    const you = (o) => row(Object.assign({ id: 'aaa', name: 'Me' }, o));
    const kim = (o) => row(Object.assign({ id: 'bbb', name: 'Kim' }, o));
    const anon = (o) => row(Object.assign({ id: 'ccc', name: '' }, o));

    // Scores chosen so no gap COINCIDES with a printed score — otherwise
    // "You’re 1,000 ahead." beside Kim's 1,000 would read as a repeat.
    const states = [
      ['alone', { score: 0 }, [you({})]],
      ['ahead', { score: 1240 }, [you({ score: 1240, max: 64 }), kim({ score: 1000, max: 32 })]],
      ['behind', { score: 900 }, [you({ score: 900 }), kim({ score: 1030 })]],
      ['level', { score: 1000 }, [you({ score: 1000 }), kim({ score: 1000 })]],
      ['a crowd', { score: 10 }, [you({ score: 10 }), kim({ score: 5 }), anon({ score: 1 })]],
      ['you out, they play on', { score: 900, over: true },
        [you({ score: 900, over: true }), kim({ score: 1030 })]],
      ['they reached 2048', { score: 900 },
        [you({ score: 900 }), kim({ score: 2400, max: 2048, won: true })]],
      ['you reached 2048', { score: 2400, won: true },
        [you({ score: 2400, max: 2048, won: true }), kim({ score: 900 })]],
      ['a nameless winner', { score: 900 },
        [you({ score: 900 }), anon({ score: 2400, max: 2048, won: true })]],
      ['you win on score', { score: 2000, over: true },
        [you({ score: 2000, over: true, max: 512 }), kim({ score: 940, over: true, max: 256 })]],
      ['they win on score', { score: 800, over: true },
        [you({ score: 800, over: true }), kim({ score: 1900, over: true, max: 256 })]],
      ['a tie', { score: 900, over: true },
        [you({ score: 900, over: true }), kim({ score: 900, over: true })]],
    ];

    const said = [];
    for (const [name, game, list] of states) {
      const { status, scores } = mp.show(game, list);
      const printed = [...scores.matchAll(/class="score">([^<]+)</g)].map((m) => m[1]);
      // Whole numbers only — the "0" in a score of 0 is not a repeat of the
      // "0" inside "first to 2048".
      const dupes = printed.filter((n) =>
        new RegExp('(^|[^\\d,])' + n + '([^\\d,]|$)').test(status));
      check('a score is printed once — ' + name, dupes.length === 0, { status, dupes });
      check('the bar still says something — ' + name, status.trim().length > 3, status);
      said.push([name, status]);
    }

    const byName = Object.fromEntries(said);
    check('the winner takes the verb its name asks for — never "They wins"',
      byName['they reached 2048'] === 'Kim reached 2048 first.' &&
      byName['a nameless winner'] === 'They reached 2048 first.' &&
      byName['you win on score'] === 'You win on score.' &&
      byName['they win on score'] === 'Kim wins on score.', byName);
    check('the gap is what the line adds — the one thing two scores do not say',
      byName['ahead'] === 'You’re 240 ahead.' &&
      byName['behind'] === 'You’re 130 behind.' &&
      byName['level'] === 'Dead even.', byName);
    check('the overlay across the board says you are out, so the bar does not too',
      !/out/i.test(byName['you out, they play on']), byName['you out, they play on']);

    const wonList = mp.show({ score: 2400, won: true },
      [you({ score: 2400, max: 2048, won: true }), kim({ score: 900 })]).scores;
    check('a 2048 winner is not tagged "2048" beside a chip that reads 2048',
      /chip-2048">2048</.test(wonList) && !/tag">2048</.test(wonList), wonList);
  }

  // ---- the wiring a vm cannot click --------------------------------------
  {
    const html = read('index.html');
    const app = read('app.js');
    const ui = read('hist-ui.js');
    const storage = read('storage.js');
    const build = read('build.mjs');
    const css = read('style.css');
    const help = read('help.md');

    check('index.html ships the Games button and the panel',
      /id="histBtn"/.test(html) && /id="hist-panel"/.test(html) &&
      /id="hist-list"/.test(html) && /id="hist-close"/.test(html));
    check('hist.js loads before storage.js, hist-ui.js after game_manager.js',
      html.indexOf('hist.js') < html.indexOf('storage.js') &&
      html.indexOf('hist-ui.js') > html.indexOf('vendor/game_manager.js'));
    check('build.mjs packs both new files', /'hist\.js'/.test(build) && /'hist-ui\.js'/.test(build));
    check('build.mjs refuses a build with no way into history',
      /id="hist-panel"/.test(build) && /id="histBtn"/.test(build));
    check('app.js files the losing board before upstream clears it',
      /this\.over[\s\S]{0,120}LocalStorageManager\.finalize/.test(app));
    check('app.js mounts the panel once the game exists',
      app.indexOf('new GameManager') < app.indexOf('mountHistUI'));
    check('the panel blocks play instead of taking moves you cannot see',
      /histOpen\(\)/.test(app) && /origMove/.test(app));
    check('the panel swallows keys in CAPTURE, before the game hears them',
      /addEventListener\('keydown'[\s\S]{0,400}\},\s*true\)/.test(ui) && /stopPropagation/.test(ui));
    check('delete asks first — no one-tap loss of a game',
      /confirming/.test(ui) && /data-yes/.test(ui) && /data-no/.test(ui));
    check('delete is the standard row-del button and the shared trash glyph',
      /class="row-del"/.test(ui) && /<svg viewBox="0 0 24 24"/.test(ui) && /button\.row-del/.test(css));
    check('✕ is close, never delete', /id="hist-close"/.test(html) && !/row-del[^>]*&#10005;/.test(html));
    check('the panel escapes ids and names it prints', /function esc\(/.test(ui) && /esc\(row\.id\)/.test(ui));
    check('friend-mode hides the Games button', /body\.friend[\s\S]{0,80}\.hist-button/.test(css));
    check('friend-mode stands the heading Score/Best pair down — the bar has both',
      /body\.friend \.scores-container\s*\{[^}]*display:\s*none/.test(css));

    // A preview whose tile colours lose to the empty-cell rule paints every
    // board as blank — which is exactly what shipped for one build, because
    // `.prev .pv` (two classes) outranks a bare `.pv-16` (one).
    {
      const classes = (sel) => (sel.match(/\.[A-Za-z0-9_-]+/g) || []).length;
      const base = (css.match(/([^{}\n]*\.pv)\s*\{/) || [])[1];
      const tiles = [...css.matchAll(/([^{}\n]*\.pv-[A-Za-z0-9]+)\s*\{/g)].map((m) => m[1].trim());
      check('every preview tile colour outranks the empty-cell rule',
        !!base && tiles.length >= 12 &&
        tiles.every((t) => classes(t) >= classes(base)),
        { base: base && base.trim(), weakest: tiles.filter((t) => classes(t) < classes(base || '')) });
    }
    check('storage.js keeps best score out of the archive — deleting a game does not rewrite it',
      /id: 'best'/.test(storage) && !/hist\.[a-z]+\([^)]*best/i.test(storage));
    check('storage.js reads the collection ONCE at boot',
      /function readAll\(/.test(storage) && (storage.match(/db\.getAll\(\)/g) || []).length === 1);
    check('help.md documents that games are kept and how to delete one',
      /## Your games/.test(help) && /delete/i.test(help));
  }

  console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
