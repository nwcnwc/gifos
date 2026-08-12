// gifos-purse: entitlements, ledger, and the subscription envelope.
//
// The rule under test more than any other: none of this may leave the computer
// inside a GIF or a backup. An entitlement that travelled would be a purchase
// given away with a share; a ledger that travelled would hand a stranger a
// spending history (docs/payments.md).
const path = require('path');
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-purse.js'));
const P = globalThis.GifOS.purse;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const refuses = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const DAY = 86400000;

// ---- THE EXPORT RULE --------------------------------------------------------
const store = P.memoryStore();
const purse = P.make(store);
purse.grant('shop', 'pro', { amount: '2000000', at: 1 });
purse.record('shop', { amount: '2000000', sku: 'pro', at: 1 });
purse.grantPermission('news', { cap: '5000000', periodMs: 30 * DAY, expiresAt: 1000 * DAY, signedAt: 0 });

const all = store.keys();
const exportable = P.redactForExport(all);
check('every payment key is refused for export', all.length > 0 && exportable.length === 0, all.length + ' keys, ' + exportable.length + ' exportable');
check('an unrelated key IS still exportable', P.isExportable('desktop.items') && !P.isExportable('pay.ent:shop:pro'));

// ---- entitlements -----------------------------------------------------------
check('a granted sku is entitled; an ungranted one is not', purse.entitled('shop', 'pro') && !purse.entitled('shop', 'deluxe'));
check('entitlements are per APP — another app does not inherit them', !purse.entitled('otherapp', 'pro'));
check('granting twice does not create a second purchase', (() => {
  const before = store.keys().filter((k) => k.startsWith('pay.ent:shop:')).length;
  purse.grant('shop', 'pro', { amount: '2000000', at: 2 });
  return store.keys().filter((k) => k.startsWith('pay.ent:shop:')).length === before;
})(), 'idempotent');
check('an entitlement needs both appId and sku', refuses(() => purse.grant('shop', ''), /needs an appId and a sku/));
check('entitlements(app) lists what was bought', JSON.stringify(purse.entitlements('shop')) === JSON.stringify(['pro']));

// ---- ledger -----------------------------------------------------------------
purse.record('shop', { amount: '500000', sku: null, at: 3 });
const hist = purse.history('shop');
check('the ledger keeps entries in order and stamps a seq', hist.length === 2 && hist[0].seq === 0 && hist[1].seq === 1);
check('spentTotal adds the entries exactly', String(purse.spentTotal('shop')) === '2500000', String(purse.spentTotal('shop')));
check('a fresh app has an empty history and zero spend', purse.history('nobody').length === 0 && String(purse.spentTotal('nobody')) === '0');

// Totals must not go through floats.
const big1 = P.make(P.memoryStore());
big1.record('x', { amount: '9007199254740993' });
big1.record('x', { amount: '9007199254740993' });
check('ledger totals are exact beyond 2^53', String(big1.spentTotal('x')) === '18014398509481986', String(big1.spentTotal('x')));

// ---- spend permissions (subscriptions) --------------------------------------
check('a permission must have a positive cap', refuses(() => purse.grantPermission('a', { cap: '0', periodMs: DAY, expiresAt: 10 }), /positive cap/));
check('a permission must have a period', refuses(() => purse.grantPermission('a', { cap: '10', periodMs: 0, expiresAt: 10 }), /needs a period/));
check('a permission MUST expire — an endless one is a blank cheque',
  refuses(() => purse.grantPermission('a', { cap: '10', periodMs: DAY }), /must expire/));

const sub = P.make(P.memoryStore());
sub.grantPermission('news', { cap: '5000000', periodMs: 30 * DAY, expiresAt: 365 * DAY, signedAt: 0 });

let d = sub.checkPermission('news', '2000000', 1 * DAY);
check('a renewal inside the cap is allowed', d.allowed === true);
sub.commitPermission('news', d);
check('committing records what was spent', sub.permission('news').spent === '2000000');

d = sub.checkPermission('news', '2000000', 2 * DAY);
sub.commitPermission('news', d);
check('a second renewal accumulates within the period', sub.permission('news').spent === '4000000');

d = sub.checkPermission('news', '2000000', 3 * DAY);
check('REFUSES the renewal that would exceed the agreed cap', d.allowed === false && /exceed the 5000000/.test(d.reason), d.reason);
check('a refusal does NOT half-spend (no mutation without commit)', sub.permission('news').spent === '4000000');
check('committing a refusal is itself refused', refuses(() => sub.commitPermission('news', d), /was not allowed/));

// The window rolls: a monthly cap is per month, not for all time.
d = sub.checkPermission('news', '2000000', 31 * DAY);
check('the period rolls forward and the cap refreshes', d.allowed === true && d.spentAfter === '2000000', 'spentAfter ' + (d && d.spentAfter));
sub.commitPermission('news', d);
check('a long gap skips whole periods rather than drifting', (() => {
  const dd = sub.checkPermission('news', '1', 200 * DAY);
  return dd.allowed && (200 * DAY - dd.windowStart) < 30 * DAY;
})());

// Expiry and revoke are absolute.
check('REFUSES a renewal after the permission expired',
  (() => { const dd = sub.checkPermission('news', '1', 400 * DAY); return dd.allowed === false && /expired/.test(dd.reason); })());
check('REFUSES when no permission was ever granted',
  (() => { const dd = sub.checkPermission('never', '1', 1); return dd.allowed === false && /no spend permission/.test(dd.reason); })());
sub.revoke('news');
check('revoke kills the permission immediately',
  sub.permission('news') === null && sub.checkPermission('news', '1', 32 * DAY).allowed === false);

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
process.exit(failures ? 1 : 0);
