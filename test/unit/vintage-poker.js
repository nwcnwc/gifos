// VINTAGE POKER HAS TO PLAY A HAND.
//
// The port kills Pobermeier/vintage-poker’s Node + socket.io hall: the host
// deals, Invite is the seats, chips are toys. A ranking table that never
// deals, or a table that deals and then deadlocks, is not Hold'em. This suite
// loads the shipped poker.js in a vm, seeds the shoe, and PLAYS: deal, fold
// (uncontested), a call-down to showdown, an all-in runout, a side pot.
// Phone/guest/listing rules a vm cannot click are source-scanned — a line
// that must stay is better guarded by a grep than by a browser suite that
// cannot launch.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'vintage-poker');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function seeded(seed) {
  let x = seed >>> 0;
  if (!x) x = 1;
  return function () {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

function load() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'poker.js'), 'utf8'), sandbox, { filename: 'poker.js' });
  return sandbox;
}

function src(name) {
  return fs.readFileSync(path.join(APP, name), 'utf8');
}

function sum(t) {
  return t.seats.reduce((a, s) => a + (s.stack || 0), 0) + (t.pot || 0);
}

const S = load();
const PK = S.PK;
check('poker.js loads PK', !!(PK && PK.newTable && PK.startHand && PK.applyAction && PK.eval5));

{
  const d = PK.makeDeck();
  check('a shoe is 52', d.length === 52, d.length);
  const keys = {};
  d.forEach((c) => { keys[c.r + c.s] = 1; });
  check('…all distinct', Object.keys(keys).length === 52);
}

{
  const c = (r, s) => ({ r, s });
  const rf = PK.eval5([c(14, 's'), c(13, 's'), c(12, 's'), c(11, 's'), c(10, 's')]);
  const sf = PK.eval5([c(9, 'h'), c(8, 'h'), c(7, 'h'), c(6, 'h'), c(5, 'h')]);
  const wheel = PK.eval5([c(14, 's'), c(2, 'h'), c(3, 'd'), c(4, 'c'), c(5, 's')]);
  const pair = PK.eval5([c(14, 's'), c(14, 'h'), c(9, 'd'), c(4, 'c'), c(2, 's')]);
  check('royal flush is the top category', rf.cat === 9, rf);
  check('straight flush sits under it', sf.cat === 8 && rf.score > sf.score, sf);
  check('A-2-3-4-5 is a wheel', wheel.cat === 4, wheel);
  check('a pair is a pair', pair.cat === 1, pair);
}

// Deal two, fold: the other seat wins uncontested. Seeded so the shoe is a tape.
{
  const t = PK.newTable();
  PK.sit(t, 'a', 'Alice', 1000, false);
  PK.sit(t, 'b', 'Bob', 1000, false);
  check('the first deal sits the button on seat 0', (function () {
    const ok = PK.startHand(t, seeded(7));
    return ok && t.dealer === 0 && t.phase === 'preflop';
  })(), { dealer: t.dealer, phase: t.phase });
  check('each live seat gets two hole cards', t.seats[0].hand.length === 2 && t.seats[1].hand.length === 2,
    { a: t.seats[0].hand.length, b: t.seats[1].hand.length });
  const actor = t.toAct;
  const folded = t.seats[actor].name;
  check('someone is to act preflop', actor === 0 || actor === 1, actor);
  check('fold is legal', PK.legal(t, actor).fold === true);
  check('the fold applies', PK.applyAction(t, actor, 'fold') === true);
  check('…and the hand is over (uncontested)', t.phase === 'showdown', t.phase);
  check('…the other seat wins the blinds', t.winners.length === 1 && t.winners[0].name !== folded && t.winners[0].nameHand === 'uncontested',
    t.winners);
  check('chips are conserved on a fold', sum(t) === 2000, sum(t));
}

// Call every street to a showdown. Five board cards. A winner with a named hand.
{
  const t = PK.newTable();
  PK.sit(t, 'a', 'Alice', 1000, false);
  PK.sit(t, 'b', 'Bob', 1000, false);
  check('a second deal starts', PK.startHand(t, seeded(42)) === true);
  let guard = 0, badAct = false;
  const phases = [t.phase];
  while (t.phase !== 'showdown' && t.phase !== 'idle' && guard++ < 80) {
    const i = t.toAct;
    if (!(i === 0 || i === 1)) badAct = true;
    const L = PK.legal(t, i);
    const kind = L.toCall > 0 ? 'call' : 'check';
    const ok = PK.applyAction(t, i, kind);
    if (!ok) {
      check('every call/check applies', false, { kind, i, phase: t.phase, L });
      break;
    }
    if (phases[phases.length - 1] !== t.phase) phases.push(t.phase);
  }
  check('every street has a live actor', !badAct);
  check('a call-down reaches showdown', t.phase === 'showdown', { phase: t.phase, phases, guard });
  check('the board is five cards', t.board.length === 5, t.board.map(PK.label));
  check('the streets were preflop → flop → turn → river → showdown',
    phases.join('>') === 'preflop>flop>turn>river>showdown', phases);
  check('a named hand takes the pot', t.winners.length >= 1 && t.winners[0].amount > 0 && t.winners[0].nameHand,
    t.winners);
  check('chips are conserved through showdown', sum(t) === 2000, sum(t));
}

// All-in short stack: the board runs out, unmatched chips come back, not a fake win.
{
  const t = PK.newTable();
  PK.sit(t, 'short', 'Short', 40, false);
  PK.sit(t, 'deep', 'Deep', 1000, false);
  PK.startHand(t, seeded(9));
  let g = 0;
  while (t.phase !== 'showdown' && t.phase !== 'idle' && g++ < 40) {
    const i = t.toAct;
    if (i == null) break;
    const L = PK.legal(t, i);
    if (L.raiseTo) PK.applyAction(t, i, 'raise', L.raiseTo);
    else PK.applyAction(t, i, L.toCall > 0 ? 'call' : 'check');
  }
  check('an all-in runs the board to showdown', t.phase === 'showdown' && t.board.length === 5,
    { phase: t.phase, board: t.board.length, msg: t.msg });
  check('unmatched chips are not listed as a win', t.winners.every((w) => w.amount <= 80), t.winners);
  check('the two stacks still add to 1040', sum(t) === 1040, sum(t));
}

// Side pots: short trips take the main, deep pair takes the side.
{
  const t = PK.newTable();
  PK.sit(t, 'a', 'A', 100, false);
  PK.sit(t, 'b', 'B', 500, false);
  PK.sit(t, 'c', 'C', 500, false);
  t.phase = 'river';
  t.board = [{ r: 2, s: 's' }, { r: 3, s: 'h' }, { r: 8, s: 'd' }, { r: 9, s: 'c' }, { r: 14, s: 's' }];
  t.seats[0].folded = false; t.seats[0].contrib = 100; t.seats[0].stack = 0; t.seats[0].allIn = true;
  t.seats[0].hand = [{ r: 8, s: 'h' }, { r: 8, s: 'c' }];
  t.seats[1].folded = false; t.seats[1].contrib = 500; t.seats[1].stack = 0; t.seats[1].allIn = true;
  t.seats[1].hand = [{ r: 14, s: 'h' }, { r: 13, s: 'd' }];
  t.seats[2].folded = false; t.seats[2].contrib = 500; t.seats[2].stack = 0; t.seats[2].allIn = true;
  t.seats[2].hand = [{ r: 7, s: 'h' }, { r: 6, s: 'd' }];
  t.pot = 1100;
  t.seats[1].allIn = false; t.seats[1].acted = false; t.seats[1].bet = 0; t.toAct = 1; t.streetBet = 0;
  PK.applyAction(t, 1, 'check');
  const by = {};
  t.winners.forEach((w) => { by[w.name] = w; });
  check('side pot: trips take the main 300', by.A && by.A.amount === 300 && /three/.test(by.A.nameHand), t.winners);
  check('side pot: pair takes the side 800', by.B && by.B.amount === 800 && by.B.nameHand === 'pair', t.winners);
  check('side pot: the air takes nothing', t.seats[2].stack === 0, t.seats[2].stack);
  check('side pot conserves 1100', sum(t) === 1100, sum(t));
}

{
  const t = PK.newTable();
  PK.sit(t, 'a', 'A', 0, false);
  t.seats[0].sittingOut = true;
  check('rebuy puts a broke seat back in', PK.rebuy(t, 'a', PK.START) && t.seats[0].stack === 1000 && t.seats[0].sittingOut === false,
    t.seats[0]);
}

// ---- source scans (phone, guests, listing, walls) --------------------------
{
  const html = src('index.html');
  const css = src('style.css');
  const js = src('app.js');
  const listing = JSON.parse(src('listing.json'));
  const man = JSON.parse(src('manifest.json'));
  const help = src('help.md');

  check('no in-app Invite button', !/>\s*Invite\s*</.test(html) && !/id=["']invite/i.test(html));
  check('fold/call/raise exist with aria-labels',
    /id="foldBtn" aria-label="Fold"/.test(html) &&
    /id="callBtn" aria-label="Call"/.test(html) &&
    /id="raiseBtn" aria-label="Raise"/.test(html));
  check('phone action buttons are 48px tall', /min-height:48px/.test(css));
  check('[hidden] actually hides (raise-row is display:flex)', css.includes('[hidden]{display:none !important}'));
  check('the home panel is not a playing-card .card', !/class="card[\s"]/.test(html) && /class="panel setup"/.test(html));
  check('playing cards use .pcard', /className = 'pcard'/.test(js) && css.includes('.pcard{'));
  check('guests who open the invite sit without tapping Play with friends',
    js.includes('if (roomDb && !owner) mpEnter()'));
  check('the file holds the chip pile (gifos.db save, private)',
    js.includes("db('save')") && man.data.save.visibility === 'private' && js.includes("id: 'last'"));
  check('chips are written at hand end, not mid-street',
    js.includes("t.phase !== 'showdown' && t.phase !== 'idle'"));
  check('empty table copy is distinct from waiting-on-host',
    js.includes('This table is empty') && js.includes('Waiting for the host to deal'));
  check('listing leads with no-account / no-cash / invite is the table',
    /^No account, no cash/.test(listing.description) &&
    /invite is the table/i.test(listing.description) &&
    /no game server/i.test(listing.description));
  check('listing says toy chips, not a wallet',
    /Toy chips only/.test(listing.description) && !/wallet/i.test(listing.description.split('original')[0]));
  check('cards stay generic ranks and suits',
    /generic ranks and suits/.test(listing.description) &&
    !/bicycle|bee|copag|theory11/i.test(html + js + listing.description));
  check('their server stays behind',
    !/socket\.io|express|mongoose/i.test(js + src('poker.js')));
  check('no CDN / webfont / remote at load',
    !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')) &&
    !/@import|fonts\.google/i.test(css));
  check('help does not document OS internals', !/gifos\.db|sandbox|localStorage/.test(help));
  check('help.md names fold/call/raise and toy chips',
    /fold/i.test(help) && /call/i.test(help) && /raise/i.test(help) && /Toy chips/i.test(help));
  check('minBuild stays 947', man.minBuild === 947);
  check('multiplayer + db declared; no network',
    man.capabilities.db === true && man.capabilities.multiplayer === true && !man.capabilities.network);
}

if (failures) {
  console.log('\n' + failures + ' failing');
  process.exit(1);
}
console.log('\nAll tests passed.');
