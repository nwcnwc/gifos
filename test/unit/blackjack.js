// BLACKJACK HAS TO ACTUALLY PLAY A HAND.
//
// The table shipped Deal / Hit / Stand but Invite seating lost the host on
// the first heartbeat (`joined` was rewritten undefined), guests never
// collected their chips, Double was missing, and a broke pile still dealt.
// This suite PLAYS the shipped rules with a seeded shoe — deal, hit, stand,
// double, split, 3:2, S17, a broke table — then source-scans the phone and
// seating wiring a vm cannot click.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'blackjack');
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function seededMath(seed) {
  let a = seed >>> 0;
  const m = Object.create(Math);
  m.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return m;
}

function load(math) {
  const sandbox = {
    console, Math: math || Math, Object, Array, JSON, Date, String, Number, Boolean,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('bj.js'), sandbox, { filename: 'bj.js' });
  return sandbox;
}

const { BJ } = load();
check('bj.js attaches BJ', !!(BJ && BJ.createTable && BJ.hit && BJ.stand && BJ.double));
check('a shoe is 52', BJ.makeDeck().length === 52);

const C = (v, s) => BJ.card(v, s);
const ace = C('a', 'spades');
const ten = C('10', 'hearts');
const six = C('6', 'clubs');
const nine = C('9', 'diamonds');
const five = C('5', 'clubs');
const eight = C('8', 'spades');
const eightH = C('8', 'hearts');
const two = C('2', 'clubs');
const three = C('3', 'diamonds');
const four = C('4', 'spades');
const king = C('k', 'hearts');

check('ace + ten is 21', BJ.total([ace, ten]) === 21);
check('soft aces: A A 6 is 18', BJ.total([ace, ace, six]) === 18);
check('A + 6 is soft 17', BJ.isSoft([ace, six]) && BJ.total([ace, six]) === 17);
check('a natural labels as 21, not soft 21', BJ.totalLabel([ace, ten]) === '21');
check('A + 6 labels as soft 17', BJ.totalLabel([ace, six]) === 'soft 17');
check('natural is blackjack', BJ.isBj([ace, ten]) && !BJ.isBj([ace, five, five]));
check('8-8 is a pair, 10-K is not', BJ.isPair([eight, eightH]) && !BJ.isPair([ten, king]));

{
  const r = BJ.decide([ten, six], [ace, ten]);
  check('player blackjack beats a 16', r.winner === 1 && r.bj === true, r);
  check('a natural pays 3:2 (10 → +15)', BJ.chipDelta(10, r) === 15, BJ.chipDelta(10, r));
  check('even money on a 10 stake is +10', BJ.chipDelta(10, { winner: 1 }) === 10);
  check('a loss is −stake', BJ.chipDelta(10, { winner: 0 }) === -10);
  check('a push is 0', BJ.chipDelta(10, { winner: 2 }) === 0);
}

{
  const bust = BJ.decide([ten, six], [ten, ten, five]);
  check('a bust loses even if the dealer is live', bust.winner === 0 && bust.tag === 'bust', bust);
}

// S17: dealer hits 16, stands on 17 including soft 17.
{
  const d16 = [ten, six];
  BJ.dealerPlay(d16, [five, nine]);
  check('dealer hits a 16', BJ.total(d16) === 21, BJ.total(d16));
  const d17 = [ten, C('7', 'clubs')];
  BJ.dealerPlay(d17, [ace]);
  check('dealer stands on a hard 17', d17.length === 2 && BJ.total(d17) === 17);
  const soft = [ace, six];
  BJ.dealerPlay(soft, [four]);
  check('dealer stands on a soft 17', soft.length === 2 && BJ.total(soft) === 17, BJ.total(soft));
}

check('broke table: 0 chips cannot cover a 10 stake', BJ.canDeal(0, 10) === false);
check('9 chips still cannot deal', BJ.canDeal(9, 10) === false);
check('10 chips can deal', BJ.canDeal(10, 10) === true);
check('a refill is 200 chips', BJ.REFILL === 200 && BJ.START === 200 && BJ.STAKE === 10);

// PLAY a natural from a known shoe. Deal order: P, D, P, D.
{
  const shoe = [ace, nine, ten, six];
  const tab = BJ.createTable({ shoe: shoe, players: [{ id: 'p', name: 'you' }], handId: 1 });
  check('a dealt natural ends the hand', tab.phase === 'done', tab.phase);
  check('player cards are A then 10', tab.hands[0].cards[0].value === 'a' && tab.hands[0].cards[1].value === '10');
  check('the natural nets +15', BJ.netFor(tab, 'p') === 15, BJ.netFor(tab, 'p'));
  check('the public table does not leak the shoe', BJ.publicTable(tab).shoe === undefined);
  check('chips 200 + 15 stay non-negative', BJ.applyDeltas(200, [BJ.netFor(tab, 'p')]) === 215);
}

// PLAY a full hit/stand hand against a seeded shoe.
{
  const sand = load(seededMath(0xB1A7));
  const tab = sand.BJ.createTable({
    rand: sand.Math.random,
    players: [{ id: 'p', name: 'you' }],
    handId: 'seed',
  });
  check('a seeded deal reaches play or a natural', tab.phase === 'play' || tab.phase === 'done', tab.phase);
  let steps = 0;
  while (tab.phase === 'play' && steps < 12) {
    const h = sand.BJ.activeHand(tab, 'p');
    const t = sand.BJ.total(h.cards);
    if (t < 17) sand.BJ.hit(tab, 'p');
    else sand.BJ.stand(tab, 'p');
    steps++;
  }
  check('the seeded hand finishes', tab.phase === 'done', tab.phase);
  const d = sand.BJ.total(tab.dealer);
  const p = sand.BJ.total(tab.hands[0].cards);
  const live = p <= 21;
  check('S17: a live player leaves the dealer at 17+', !live || d >= 17, { d: d, p: p });
  const net = sand.BJ.netFor(tab, 'p');
  check('the payout is a legal chip delta', net === -10 || net === 0 || net === 10 || net === 15, net);
  let chips = 200;
  chips = sand.BJ.applyDeltas(chips, [net]);
  check('bankroll moves and never goes negative', chips >= 0 && chips === 200 + net, chips);
}

// Double: 5+6 vs 10+7, next card 9 → 20 vs 17, bet 20, +20.
{
  const shoe = [five, ten, six, C('7', 'clubs'), nine];
  const tab = BJ.createTable({ shoe: shoe, players: [{ id: 'p', name: 'you' }], handId: 2 });
  check('11 vs 10 is still in play', tab.phase === 'play' && BJ.total(tab.hands[0].cards) === 11);
  check('double is legal at 200 chips', BJ.canDouble(tab, 'p', 200));
  check('double is refused when the pile cannot cover a second stake', BJ.canDouble(tab, 'p', 15) === false);
  const ok = BJ.double(tab, 'p', 200);
  check('double takes one card and stands', ok && tab.hands[0].doubled && tab.hands[0].stood);
  check('double 5+6+9 is 20', BJ.total(tab.hands[0].cards) === 20);
  check('the hand is done after a double', tab.phase === 'done');
  check('a doubled win pays even money on 20', BJ.netFor(tab, 'p') === 20, BJ.netFor(tab, 'p'));
}

// Split 8s: each half gets one card. Split aces stand.
{
  const shoe = [eight, ten, eightH, C('7', 'clubs'), three, two, four, five];
  const tab = BJ.createTable({ shoe: shoe, players: [{ id: 'p', name: 'you' }], handId: 3 });
  check('8-8 can split', BJ.canSplit(tab, 'p', 200));
  const ok = BJ.split(tab, 'p', 200);
  check('split makes two hands', ok && BJ.myHands(tab, 'p').length === 2, BJ.myHands(tab, 'p').length);
  check('no re-split', BJ.canSplit(tab, 'p', 200) === false);
  BJ.stand(tab, 'p');
  BJ.stand(tab, 'p');
  check('both halves settle', tab.phase === 'done', tab.phase);
  const nets = BJ.resultsFor(tab, 'p');
  check('two results after a split', nets.length === 2);
  check('a 21 after a split is not a 3:2 natural', nets.every(function (r) { return !r.bj; }));
}

{
  const shoe = [ace, ten, C('a', 'hearts'), C('7', 'clubs'), C('9', 'spades'), C('k', 'clubs')];
  const tab = BJ.createTable({ shoe: shoe, players: [{ id: 'p', name: 'you' }], handId: 4 });
  BJ.split(tab, 'p', 200);
  check('split aces get one card each and stand', tab.phase === 'done' && BJ.myHands(tab, 'p').every(function (h) {
    return h.cards.length === 2 && h.stood;
  }));
}

// Two seats, host deals, guest hits, dealer plays only after both are done.
{
  const shoe = [
    five, eight, ten,           // p1 5, p2 8, dealer up 10
    six, C('7', 'hearts'), nine, // p1 6, p2 7, dealer hole 9  → 11, 15, 19
    two, four, three
  ];
  const tab = BJ.createTable({
    shoe: shoe,
    players: [{ id: 'host', name: 'H' }, { id: 'guest', name: 'G' }],
    handId: 5,
  });
  check('two seats are dealt', tab.hands.length === 2 && tab.phase === 'play');
  check('dealer hole stays in the private shoe until the end', tab.shoe.length > 0);
  BJ.hit(tab, 'host');
  check('a host hit does not play the dealer yet', tab.phase === 'play');
  BJ.stand(tab, 'guest');
  check('one stand is not enough', tab.phase === 'play');
  BJ.stand(tab, 'host');
  check('dealer plays once every seat is done', tab.phase === 'done');
  check('dealer stood on 19', BJ.total(tab.dealer) === 19, BJ.total(tab.dealer));
  check('guest 15 vs 19 loses 10', BJ.netFor(tab, 'guest') === -10);
}

// Invite seating helpers: live seats, host is first joined, stale seats drop.
{
  const now = 1e12;
  const items = [
    { kind: 'seat', id: 'a', at: now, joined: 10, name: 'Ann' },
    { kind: 'seat', id: 'b', at: now, joined: 20, name: 'Bob' },
    { kind: 'seat', id: 'c', at: now - 20000, joined: 1, name: 'Stale' },
    { kind: 'table', id: 'table', phase: 'play' },
  ];
  const live = BJ.liveSeats(items, now, BJ.PRES_TTL);
  check('a seat older than 12s is not at the table', live.length === 2 && live[0].id === 'a', live.map(function (p) { return p.id; }));
  check('the host is the first person who sat', BJ.hostId(live) === 'a');
  check('an empty room falls back to the owner', BJ.hostId([], 'owner') === 'owner');
}

// applyDeltas never pays cash below zero.
check('a broke pile cannot go negative', BJ.applyDeltas(5, [-10]) === 0);

// Source-scan: wiring a vm cannot execute.
const app = read('app.js');
const html = read('index.html');
const css = read('style.css');
const help = read('help.md');
const listing = JSON.parse(read('listing.json'));
const manifest = JSON.parse(read('manifest.json'));

check('Hit / Stand / Double / Split / Restock are real buttons',
  /id="hit"/.test(html) && /id="stand"/.test(html) && /id="double"/.test(html) &&
  /id="split"/.test(html) && /id="refill"/.test(html));
check('phone tap targets are 48px+',
  /min-height:\s*48px/.test(css) && /touch-action:\s*manipulation/.test(css));
check('hidden action buttons stay hidden (display:none !important)',
  /\.bar button\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css));
check('heartbeat keeps joined: mp.joined (host does not flip)',
  /joined:\s*mp\.joined/.test(app) && /mp\.joined\s*=\s*nowMs\(\)/.test(app));
check('guest actions carry a seq the host applies once',
  /seq:\s*mp\.seq/.test(app) && /applied\[key\]/.test(app));
check('the host writes a public table with no shoe',
  /publicTable/.test(app) && app.includes("BJ.publicTable"));
check('guests settle their own pile on a done hand',
  /settleFrom/.test(app) && /netFor/.test(app) && /lastSettled/.test(app));
check('old saves still load (chips number is enough)',
  /typeof rec\.chips === 'number'/.test(app));
check('no in-app Invite button (OS chrome)',
  !/>\s*Invite\s*</.test(html) && !/id=["']invite/i.test(html));
check('H/S/D tap-or-key hit, stand, double',
  /k === 'h'/.test(app) && /k === 's'/.test(app) && /k === 'd'/.test(app));
check('the prompt drops Double after a hit (does not keep the deal-time msg)',
  /canSplit\(tab, me\.id, chips\)/.test(app) && /Hit or stand\./.test(app));
check('restock adds REFILL chips',
  /chips\s*=\s*chips\s*\+\s*BJ\.REFILL/.test(app) && /id="refill"/.test(html));
check('help says 3:2, stands on 17, double, split, restock',
  /3:2/.test(help) && /stands on 17/.test(help) &&
  /Double/.test(help) && /Split/.test(help) && /Restock/.test(help));
check('listing leads with the game / file / invite',
  /21/.test(listing.tagline) && /file/i.test(listing.tagline) && /Invite/i.test(listing.tagline) &&
  /3:2/.test(listing.description) && /file/i.test(listing.description) && /link/i.test(listing.description));
check('listing tagline fits a card', listing.tagline.length <= 80);
check('author is hanhaechi, not GifOS', listing.author.name === 'hanhaechi' && listing.porter.name === 'GifOS');
check('minBuild stays 947', manifest.minBuild === 947);
check('save is private, room is read-write',
  manifest.data.save.visibility === 'private' && manifest.data.room.visibility === 'read-write');
check('no CDN / webfont / remote at load',
  !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')) &&
  !/@import|fonts\.google/i.test(css));
check('classic scripts only', !/type=["']module["']/.test(html));
// The app is a computer game; it does not protest that it is one. No "toy
// chips", no "no cash, ever" — that copy read as nervous and is gone for good.
check('no cash disclaimers, and no cash-as-real-money copy either',
  !/no cash|toy chip|never cash|nothing is paid|not cash/i.test(listing.description + ' ' + listing.tagline + ' ' + help + ' ' + html + ' ' + app) &&
  !/real money|payout to|withdraw|deposit/i.test(listing.description));

if (failures) {
  console.log('\n' + failures + ' fail');
  process.exit(1);
}
console.log('\nblackjack unit: all PASS');
