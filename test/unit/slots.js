// SLOTS HAS TO ACTUALLY TAKE THE STAKE.
//
// Autoplay used to call Slot.spin() from onSpinEnd. That path never went
// through pull(), so credits never moved and the room never saw the spin.
// A machine that plays for free is not a fruit machine — and a table that
// cannot see Auto is not a table. This suite PLAYS the credit loop through
// the shipped math, then source-scans the wiring a vm cannot run.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'slots');
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load(files) {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

const M = load(['symbols.js', 'math.js']).SlotsMath;
check('math.js loads SlotsMath', !!(M && M.payout && M.applySpin && M.randomGrid));
check('nine fruit names, no licensed pack', (load(['symbols.js']).SLOT_NAMES || []).join(',') ===
  'cherry,lemon,grape,bell,seven,bar,star,diamond,clover');
check('cherry and seven are drawn (not empty data URLs)', (function () {
  const S = load(['symbols.js']).SlotSymbols;
  return S.cherry.indexOf('svg') > 0 && S.seven.indexOf('7') > 0 && S.cherry.length > 200;
})());

const grid = M.grid;
{
  const miss = grid(['cherry', 'lemon', 'grape', 'bell', 'bar']);
  check('a mixed payline pays nothing', M.payout(miss, 10) === 0, M.payout(miss, 10));
  const three = grid(['cherry', 'cherry', 'cherry', 'lemon', 'bar']);
  check('three cherries pay 10× the stake', M.payout(three, 10) === 100, M.payout(three, 10));
  check('…and scale with a 25 stake', M.payout(three, 25) === 250, M.payout(three, 25));
  const four = grid(['bell', 'bell', 'bell', 'bell', 'star']);
  check('four of a kind pay 25×', M.payout(four, 10) === 250, M.payout(four, 10));
  const five = grid(['star', 'star', 'star', 'star', 'star']);
  check('five of a kind pay 100×', M.payout(five, 10) === 1000, M.payout(five, 10));
  const s3 = grid(['seven', 'seven', 'seven', 'cherry', 'lemon']);
  check('three 7s pay 50×', M.payout(s3, 10) === 500, M.payout(s3, 10));
  const s4 = grid(['seven', 'seven', 'seven', 'seven', 'bar']);
  check('four 7s pay 100×', M.payout(s4, 10) === 1000, M.payout(s4, 10));
  const s5 = grid(['seven', 'seven', 'seven', 'seven', 'seven']);
  check('five 7s are the jackpot at 250×', M.payout(s5, 10) === 2500, M.payout(s5, 10));
}

// Play a session: start, miss, hit, go broke, still pull, refill.
{
  let c = M.START;
  check('a fresh pile is 1000', c === 1000);
  const miss = grid(['cherry', 'lemon', 'grape', 'bell', 'bar']);
  let r = M.applySpin(c, miss, 10);
  c = r.credits;
  check('a miss deducts the stake', c === 990 && r.win === 0, r);
  const hit = grid(['cherry', 'cherry', 'cherry', 'lemon', 'bar']);
  r = M.applySpin(c, hit, 10);
  c = r.credits;
  check('three cherries: 990 − 10 + 100 = 1080', c === 1080, r);

  c = 5;
  r = M.applySpin(c, miss, 10);
  check('a broke machine does not go negative on a miss', r.credits === 0, r);
  r = M.applySpin(0, hit, 10);
  check('a hit on a broke machine restocks from the win', r.credits === 100, r);

  c = 0;
  c = c + M.REFILL;
  check('top-up adds 1000 credits', c === 1000);
}

check('stakes are 10 25 50 100', M.STAKES.join(',') === '10,25,50,100');
check('an unknown stake clamps to 10', M.clampStake(7) === 10 && M.clampStake(50) === 50);
check('describe names the fruit on a hit', /Three cherry/.test(M.describe(grid(['cherry', 'cherry', 'cherry', 'x', 'y']), 100)));
check('describe names the jackpot', /Jackpot/.test(M.describe(grid(['seven', 'seven', 'seven', 'seven', 'seven']), 2500)));

// Room: latest live spin wins; stale seats drop out.
{
  const mp = load(['mp.js']).SlotsMp;
  check('mp.js attaches SlotsMp', !!(mp && mp.latestSpin && mp.livePeople));
  const now = Date.now();
  const items = [
    { id: 'a', kind: 'seat', t: now, spin: { symbols: [['a']], t: 1, by: 'a' } },
    { id: 'b', kind: 'seat', t: now, spin: { symbols: [['b']], t: 9, by: 'b' } },
    { id: 'c', kind: 'seat', t: now - 20000, spin: { symbols: [['c']], t: 99, by: 'c' } },
  ];
  const live = mp.livePeople(items);
  check('a seat older than 12s is not at the table', live.length === 2, live.length);
  const spin = mp.latestSpin(items);
  check('the table shows the newest live spin, not the stale one', spin && spin.by === 'b', spin && spin.by);
}

// Source-scan: wiring a vm cannot execute, one-liners the phone depends on.
const app = read('app.js');
const slot = read('slot.js');
const html = read('index.html');
const css = read('style.css');
const help = read('help.md');
const listing = JSON.parse(read('listing.json'));
const manifest = JSON.parse(read('manifest.json'));

check('autoplay is wired to pull() via onAutoPlay, not Slot.spin()',
  /onAutoPlay:\s*function\s*\(\)\s*\{\s*pull\(\)/.test(app) && slot.includes('onAutoPlay'));
check('Slot.onSpinEnd does not call spin() for autoplay',
  !/onSpinEnd[\s\S]{0,400}self\.spin\(/.test(slot));
check('a room spin sets fromRoom so it does not take YOUR stake',
  /spinTo\(spin\.symbols,\s*true\)/.test(app) && /applyResult\(symbols,\s*slot\.fromRoom\)/.test(app));
check('credits persist privately as save/last',
  app.includes("db('save')") && app.includes("id: 'last'") && app.includes('credits:'));
check('the room is read-write and the save is private',
  manifest.data.save.visibility === 'private' && manifest.data.room.visibility === 'read-write');
check('no in-app Invite button (OS chrome)',
  !/>\s*Invite\s*</.test(html) && !/id=["']invite/i.test(html));
check('onBack turns autoplay off',
  /onBack/.test(app) && /autoplay[\s\S]{0,200}checked\s*=\s*false/.test(app));
check('the payline lives INSIDE the reel window (not a floating CSS guess)',
  /id="window"[\s\S]*id="line"/.test(html) &&
  /#line\{[^}]*position:absolute/.test(css.replace(/\s+/g, '')) &&
  /#line\{[^}]*top:50%/.test(css.replace(/\s+/g, '')));
check('Spin is a 44px+ thumb target',
  /#spin\{[^}]*min-height:48px/.test(css.replace(/\s+/g, '')) ||
  /#spin\{[^}]*min-height:44px/.test(css.replace(/\s+/g, '')));
check('phone hides the lever and keeps Spin full-width',
  /@media \(max-width:420px\)[\s\S]*\.lever\{display:none\}/.test(css.replace(/\s+/g, '')) ||
  /@media \(max-width:420px\)[\s\S]*\.lever\s*\{\s*display:\s*none/.test(css));
check('help explains the payline and the jackpot',
  /middle row/i.test(help) && /jackpot/i.test(help));
// No nervous "toy credits, never cash" protesting — it is a computer game.
check('no cash disclaimers anywhere a user reads',
  !/no cash|toy (credit|reel|pile)|never cash|nothing is (wagered|paid)|casino/i
    .test(listing.tagline + ' ' + listing.description + ' ' + help + ' ' + html + ' ' + app));
check('listing says friends watch the same spin from a link',
  /link/i.test(listing.description) && /same spin/i.test(listing.description));
check('listing tagline fits a card', listing.tagline.length <= 80);
check('author is johakr, not GifOS', listing.author.name === 'johakr' && listing.porter.name === 'GifOS');
check('old saves without stake still load (stake is optional)',
  /rec\.stake/.test(app) && /clampStake/.test(app));
check('space/enter pulls', /Spacebar/.test(app) && /pull\(\)/.test(app));
check('top-up restocks credits', html.includes('id="refill"') && /REFILL/.test(app));
check('top-up [hidden] is not overridden by display:block',
  /\.refill\[hidden\]\s*\{\s*display:\s*none/.test(css));
check('no CDN / webfont / remote at load',
  !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')) &&
  !/@import|fonts\.google/i.test(css));
check('classic scripts only', !/type=["']module["']/.test(html));
check('minBuild stays 947', manifest.minBuild === 947);
check('multiplayer is declared because the room is real', manifest.capabilities.multiplayer === true);

if (failures) {
  console.log('\n' + failures + ' fail');
  process.exit(1);
}
console.log('\nslots unit: all PASS');
