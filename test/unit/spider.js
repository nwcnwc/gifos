// SPIDER HAS TO DEAL HONESTLY AND PLAY.
//
// A 1-suit-only destack of lklynet that skipped Microsoft's 2/4-suit rules
// was the floor, not the game. Same-suit runs move; mixed-suit runs do not;
// empty piles take anything; the stock refuses a deal while a pile is empty;
// undo must restore the score (a completed run + undo used to keep the +100).
// This suite PLAYS that loop in a vm, and greps the UI for tap-to-move / phone.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'spider');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const sandbox = { console, Math, Object, Array, JSON, Date, String, Number, Boolean };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'engine.js'), 'utf8'), sandbox, { filename: 'engine.js' });
  return sandbox;
}

const G = load();
const S = G.Spider;
check('engine.js attaches Spider', !!(S && S.createBoardState && S.applyMoveEvent));

function card(rank, suit, faceUp) {
  return { id: rank + '-' + suit, rank: rank, suit: suit, faceUp: faceUp !== false };
}
function emptyBoard(suits) {
  const t = [];
  for (let i = 0; i < 10; i++) t.push([]);
  return {
    tableau: t, stock: [], foundation: 0, score: 500, moves: 0, gameWon: false,
    history: [], seed: 'test', suits: suits || 1
  };
}

// ---- deal shape: 104 cards, 6/5 split, 50 in stock, top face-up --------------
{
  const b = S.createBoardState('seed-1', 1);
  const b2 = S.createBoardState('seed-1', 1);
  check('same seed is the same deal', JSON.stringify(b.tableau) === JSON.stringify(b2.tableau));
  check('ten piles', b.tableau.length === 10, b.tableau.length);
  check('first four piles have 6', b.tableau.slice(0, 4).every((p) => p.length === 6));
  check('last six piles have 5', b.tableau.slice(4).every((p) => p.length === 5));
  let n = 0;
  b.tableau.forEach((p) => { n += p.length; });
  check('54 on the table, 50 in the stock', n === 54 && b.stock.length === 50, { n: n, stock: b.stock.length });
  check('only the top of each pile is face-up', b.tableau.every((p) => p.every((c, i) => c.faceUp === (i === p.length - 1))));
  check('1-suit: every card is suit 0', b.tableau.every((p) => p.every((c) => (c.suit | 0) === 0)) &&
    b.stock.every((c) => (c.suit | 0) === 0));
  check('score starts at 500', b.score === 500, b.score);
}

{
  const b2 = S.createBoardState('seed-2', 2);
  const b4 = S.createBoardState('seed-4', 4);
  const count = (b) => {
    const n = [0, 0, 0, 0];
    b.tableau.concat([b.stock]).forEach((p) => p.forEach((c) => { n[c.suit | 0]++; }));
    return n;
  };
  check('2-suit deal is 104 cards', count(b2).reduce((a, x) => a + x, 0) === 104);
  check('2-suit: 52 of each of two suits', count(b2)[0] === 52 && count(b2)[1] === 52 && count(b2)[2] === 0, count(b2));
  check('4-suit: 26 of each of four suits', count(b4).every((n) => n === 26), count(b4));
}

// ---- move groups: same-suit descending only ---------------------------------
{
  check('K-Q-J same suit is a run', S.isValidMoveGroup([card(13, 0), card(12, 0), card(11, 0)]));
  check('K-Q mixed suit is NOT a run', !S.isValidMoveGroup([card(13, 0), card(12, 1)]));
  check('K-J gap is not a run', !S.isValidMoveGroup([card(13, 0), card(11, 0)]));
  check('a single card is a run', S.isValidMoveGroup([card(5, 2)]));
}

// ---- a legal drop is rank, not suit -----------------------------------------
{
  const b = emptyBoard(2);
  b.tableau[0] = [card(8, 0)];
  b.tableau[1] = [card(7, 1)];
  const next = S.applyMoveEvent(b, { fromPileIndex: 1, toPileIndex: 0, cardIndex: 0 });
  check('a heart 7 may sit on a spade 8', !!(next && next.tableau[0].length === 2), next && next.tableau[0]);
  check('…and that costs a point', next && next.score === 499, next && next.score);
  const group = next.tableau[0];
  check('…but the mixed pair cannot move together', !S.isValidMoveGroup(group));
  const blocked = S.applyMoveEvent(next, { fromPileIndex: 0, toPileIndex: 2, cardIndex: 0 });
  check('…so dragging the mixed pair onto an empty pile is refused', blocked === null);
  const seven = S.applyMoveEvent(next, { fromPileIndex: 0, toPileIndex: 2, cardIndex: 1 });
  check('the heart 7 alone can still leave', !!(seven && seven.tableau[2].length === 1 && seven.tableau[2][0].rank === 7));
}

{
  const b = emptyBoard(1);
  b.tableau[0] = [card(5, 0)];
  b.tableau[1] = [card(9, 0)];
  check('a 9 cannot sit on a 5', S.applyMoveEvent(b, { fromPileIndex: 1, toPileIndex: 0, cardIndex: 0 }) === null);
  const ontoEmpty = S.applyMoveEvent(b, { fromPileIndex: 1, toPileIndex: 2, cardIndex: 0 });
  check('an empty pile takes any card', !!(ontoEmpty && ontoEmpty.tableau[2][0].rank === 9));
}

// ---- deal rules: refuse empty piles, deal 10 face-up -------------------------
{
  const b = S.createBoardState('deal-me', 1);
  b.tableau[3] = [];
  check('stock refuses a deal while a pile is empty', S.applyDealEvent(b) === null);
  check('canDeal agrees', S.canDeal(b) === false);
  b.tableau[3] = [card(4, 0)];
  const dealt = S.applyDealEvent(b);
  check('a full row deals ten face-up cards', !!(dealt && dealt.stock.length === 40 && dealt.tableau.every((p) => p[p.length - 1].faceUp)));
  check('a deal costs a point', dealt.score === 499, dealt.score);
}

{
  const b = emptyBoard(1);
  b.stock = [];
  for (let i = 0; i < 10; i++) b.tableau[i] = [card(2, 0)];
  check('empty stock cannot deal', S.applyDealEvent(b) === null);
}

// ---- a finished same-suit K–A leaves, mixed does not, score is honest --------
{
  const b = emptyBoard(1);
  const run = [];
  for (let r = 13; r >= 2; r--) run.push(card(r, 0));
  b.tableau[0] = run;
  b.tableau[1] = [card(1, 0)];
  const next = S.applyMoveEvent(b, { fromPileIndex: 1, toPileIndex: 0, cardIndex: 0 });
  check('dropping the ace completes a K–A run', !!(next && next.foundation === 1 && next.tableau[0].length === 0), next && { f: next.foundation, n: next.tableau[0].length });
  check('completing a run is +100 −1', next && next.score === 599, next && next.score);
  check('the game is not won on the first run', next && next.gameWon === false);
}

{
  const b = emptyBoard(2);
  const run = [];
  for (let r = 13; r >= 2; r--) run.push(card(r, 0));
  run[5] = card(8, 1); // mixed in the middle, ranks still 13..2
  b.tableau[0] = run;
  b.tableau[1] = [card(1, 0)];
  const next = S.applyMoveEvent(b, { fromPileIndex: 1, toPileIndex: 0, cardIndex: 0 });
  check('a mixed-suit 13 does not leave the tableau', !!(next && next.foundation === 0 && next.tableau[0].length === 13), next && { f: next && next.foundation, n: next && next.tableau[0].length });
}

{
  const b = emptyBoard(1);
  const run = [];
  for (let r = 13; r >= 2; r--) run.push(card(r, 0));
  b.tableau[0] = run;
  b.tableau[1] = [card(1, 0)];
  const next = S.applyMoveEvent(b, { fromPileIndex: 1, toPileIndex: 0, cardIndex: 0 });
  const undone = S.applyUndoEvent(next);
  check('undo restores the tableau', !!(undone && undone.foundation === 0 && undone.tableau[1].length === 1 && undone.tableau[1][0].rank === 1));
  check('undo restores the score (no +100 kept)', undone && undone.score === 500, undone && undone.score);
}

// ---- eight runs win; turning a face-down card --------------------------------
{
  const b = emptyBoard(1);
  const run = [];
  for (let r = 13; r >= 2; r--) run.push(card(r, 0));
  b.tableau[0] = [card(6, 0, false)].concat(run);
  b.tableau[1] = [card(1, 0)];
  b.foundation = 7;
  const next = S.applyMoveEvent(b, { fromPileIndex: 1, toPileIndex: 0, cardIndex: 0 });
  check('the eighth run wins the game', !!(next && next.gameWon && next.foundation === 8), next && { w: next.gameWon, f: next.foundation });
  check('the buried card turns face-up', next && next.tableau[0].length === 1 && next.tableau[0][0].faceUp === true && next.tableau[0][0].rank === 6);
}

{
  const b = emptyBoard(1);
  b.tableau[0] = [card(10, 0, false), card(5, 0)];
  b.tableau[1] = [card(6, 0)];
  check('a face-down card cannot be moved', S.applyMoveEvent(b, { fromPileIndex: 0, toPileIndex: 1, cardIndex: 0 }) === null);
}

// ---- play a few real moves on a seeded 1-suit deal ---------------------------
{
  const b = S.createBoardState('play-loop', 1);
  const moves = S.enumerateMoves(b.tableau);
  check('a fresh 1-suit deal has legal moves', moves.length > 0, moves.length);
  const next = S.applyMoveEvent(b, moves[0]);
  check('applying a listed move mutates the tableau', !!(next && next.moves === 1 && JSON.stringify(next.tableau) !== JSON.stringify(b.tableau)));
  const hint = S.pickHintMove(b.tableau);
  check('hint is one of the listed moves', !!(hint && moves.some((m) => m.fromPileIndex === hint.fromPileIndex && m.toPileIndex === hint.toPileIndex && m.cardIndex === hint.cardIndex)));
  const auto = S.pickAutoMoveTarget(b.tableau, moves[0].fromPileIndex, moves[0].cardIndex);
  check('tap-again auto-move finds a pile', auto >= 0, auto);
}

// ---- old 1-suit saves (no suit field) still load -----------------------------
{
  const raw = S.createBoardState('old', 1);
  raw.tableau.forEach((p) => p.forEach((c) => { delete c.suit; }));
  raw.stock.forEach((c) => { delete c.suit; });
  delete raw.suits;
  const loaded = S.hydrateBoard(raw);
  check('a pre-suit save hydrates as 1-suit', !!(loaded && loaded.suits === 1 && loaded.tableau[0][0].suit === 0));
  check('a junk save is refused', S.hydrateBoard({ tableau: [] }) === null);
}

// ---- source: tap-to-move, phone, onBack, no in-app Invite --------------------
{
  const app = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
  const listing = fs.readFileSync(path.join(APP, 'listing.json'), 'utf8');
  const man = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
  check('tap-to-move: click/pointer on a pile', /pointerdown/.test(app) && /onPile/.test(app));
  check('double-tap auto-move still exists', /pickAutoMoveTarget/.test(app));
  check('onBack deselects or closes overlay', /gifos\.onBack/.test(app));
  check('1/2/4-suit buttons', /data-suits="1"/.test(html) && /data-suits="4"/.test(html));
  check('no in-app Invite button', !/>\s*Invite\s*</.test(html) && !/id=["']invite/i.test(html));
  check('phone: touch-action on the tableau', /touch-action:\s*none/.test(css) || /touch-action:none/.test(css));
  check('help covers 4-suit and tap', /4 suits/.test(help) && /Tap/.test(help));
  check('listing does not mention gifos.db / Nintendo', !/gifos\.db|Nintendo|localStorage/.test(listing));
  check('save is private, not multiplayer', man.capabilities.db === true && !man.capabilities.multiplayer);
  check('minBuild stays 947', man.minBuild === 947);
}

if (failures) {
  console.log('\n' + failures + ' FAIL');
  process.exit(1);
}
console.log('\nAll spider checks passed.');
