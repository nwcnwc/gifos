// gifos-charge: who may take money, from whom, and how much.
//
// These are the rules that stand between an app and a user's wallet, so they
// are tested as refusals first. Pure decisions over data — no chain, no wallet,
// no network (docs/payments-testing.md, tier 1).
const path = require('path');
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-charge.js'));
const C = globalThis.GifOS.charge;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const refuses = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const PAYEE = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C';
const manifest = (over) => Object.assign({ appId: 'shop', name: 'Shop', pay: { to: PAYEE, chain: 'eip155:84532' } }, over || {});
const VALID = { status: 'valid', id: 'nathan.example.com', type: 'domain', ts: 1786000000000 };

// ---- the signature gate: the refusals are absolute --------------------------
check('an UNSIGNED app cannot charge', (() => {
  const e = C.eligibility({ status: 'unsigned' }, manifest());
  return e.allowed === false && /not signed/.test(e.reason);
})());

check('a TAMPERED app cannot charge', (() => {
  const e = C.eligibility({ status: 'tampered', detail: 'signature does not match these contents' }, manifest());
  return e.allowed === false && /changed since it was signed/.test(e.reason);
})());

check('an app whose author KEY CHANGED cannot charge (rotation vs takeover is unknowable)', (() => {
  const e = C.eligibility(Object.assign({}, VALID, { keyChanged: true }), manifest());
  return e.allowed === false && /signing key published by/.test(e.reason);
})(), 'refused rather than guessed at');

check('an unknown verdict shape is refused, not treated as fine', (() => {
  const e = C.eligibility({ status: 'weird' }, manifest());
  return e.allowed === false;
})());

check('a SIGNED app may charge, and the human is shown the verified IDENTITY', (() => {
  const e = C.eligibility(VALID, manifest());
  return e.allowed === true && e.identity.id === 'nathan.example.com' && e.identity.verified === true
    && e.payee.to === PAYEE && e.paypal === 'payments@nathan.example.com';
})());

// ---- the payee: chain from the signed manifest, fiat DERIVED ----------------
// THE PAYEE RULE (docs/payments.md, 2026-08-25): manifest.pay is optional now —
// an app with no block still sells on the PayPal rail, paid to its SIGNING
// IDENTITY. What must never happen is a malformed block passing as "no rail".
check('no manifest.pay block => fiat rail only, derived from the identity', (() => {
  const e = C.eligibility(VALID, { appId: 'x' });
  return e.allowed === true && e.payee === null && e.paypal === 'payments@nathan.example.com';
})());
check('a DOMAIN identity derives payments@<domain>',
  C.paypalPayeeOf({ verified: true, type: 'domain', id: 'gifos.app' }) === 'payments@gifos.app');
check('an EMAIL identity derives the email itself',
  C.paypalPayeeOf({ verified: true, type: 'email', id: 'author@example.com' }) === 'author@example.com');
check('an UNVERIFIED identity derives NOTHING — that would pay whoever forged it',
  refuses(() => C.paypalPayeeOf({ verified: false, type: 'email', id: 'a@b.co' }), /VERIFIED signing identity only/));
check('an unknown identity type derives nothing',
  refuses(() => C.paypalPayeeOf({ verified: true, type: 'hex', id: 'deadbeef' }), /unknown signing identity type/));
check('a non-address payee is refused', (() => {
  const e = C.eligibility(VALID, manifest({ pay: { to: 'nathan@example.com' } }));
  return e.allowed === false && /not an address/.test(e.reason);
})());
check('a MAINNET payee is refused (chain pinned in code)', (() => {
  const e = C.eligibility(VALID, manifest({ pay: { to: PAYEE, chain: 'eip155:8453' } }));
  return e.allowed === false && /Base Sepolia only/.test(e.reason);
})());

// ---- the request ------------------------------------------------------------
const ok = C.validateRequest({ amount: '2000000', reason: 'Unlock the full app', sku: 'pro' }, { maxAmount: '5000000' });
check('a well-formed unlock validates', String(ok.amount) === '2000000' && ok.sku === 'pro' && ok.reason === 'Unlock the full app');

check('REFUSES a charge with no ceiling set (a new app charges nothing)',
  refuses(() => C.validateRequest({ amount: '1', reason: 'x' }, { maxAmount: '0' }), /no spending ceiling/));
check('REFUSES a charge above the ceiling',
  refuses(() => C.validateRequest({ amount: '9000000', reason: 'x' }, { maxAmount: '5000000' }), /ceiling is 5000000/));
check('REFUSES a float amount (no floats on money)',
  refuses(() => C.validateRequest({ amount: '1.5', reason: 'x' }, { maxAmount: '5000000' }), /decimal integer string/));
check('REFUSES zero/negative', refuses(() => C.validateRequest({ amount: '0', reason: 'x' }, { maxAmount: '500' }), /must be positive/));
check('REFUSES a charge with no reason — the human must be told what for',
  refuses(() => C.validateRequest({ amount: '100' }, { maxAmount: '500' }), /must say what it is for/));
check('REFUSES a reason too long to display honestly',
  refuses(() => C.validateRequest({ amount: '100', reason: 'x'.repeat(300) }, { maxAmount: '500' }), /too long to show honestly/));
check('REFUSES a junk sku', refuses(() => C.validateRequest({ amount: '100', reason: 'r', sku: 'a b/../c' }, { maxAmount: '500' }), /short plain identifier/));

check('REFUSES buying the same sku twice on this computer',
  refuses(() => C.validateRequest({ amount: '100', reason: 'r', sku: 'pro' }, { maxAmount: '500', entitled: (s) => s === 'pro' }), /already purchased/));

check('a tip (editable amount) is allowed and unlocks nothing',
  (() => { const t = C.validateRequest({ amount: '1000', reason: 'Tip the author', editable: true }, { maxAmount: '500000' });
           return t.editable === true && !t.sku; })());
check('REFUSES an editable amount that also claims to unlock something',
  refuses(() => C.validateRequest({ amount: '1000', reason: 'r', editable: true, sku: 'pro' }, { maxAmount: '5000' }), /tip buys nothing/));

// A big amount must not sneak under a ceiling via float rounding.
check('amounts beyond 2^53 compare exactly (BigInt, not float)',
  refuses(() => C.validateRequest({ amount: '9007199254740993', reason: 'r' }, { maxAmount: '9007199254740992' }), /ceiling is/));

// ---- the trusted display ----------------------------------------------------
const elig = C.eligibility(VALID, manifest());
const s = C.sheet(elig, ok, 'Shop');
check('the sheet shows identity, amount, reason and what it unlocks',
  s.payingTo === 'nathan.example.com' && s.verified === true && s.amount === '2000000'
  && s.reason === 'Unlock the full app' && s.unlocks === true && s.chain === 'Base Sepolia',
  [s.payingTo, s.amount, s.chain].join(' / '));
check('the sheet carries BOTH rails: derived PayPal payee and the signed chain address',
  s.rails.paypal === 'payments@nathan.example.com' && s.rails.x402.address === PAYEE);
check('a fiat-only app\'s sheet offers NO chain rail (never a rail with a null payee)',
  (() => { const e2 = C.eligibility(VALID, { appId: 'x' }); const s2 = C.sheet(e2, ok, 'X');
           return s2.rails.x402 === null && s2.rails.paypal === 'payments@nathan.example.com'; })());

const r = C.receipt(s, '0xabc', 1786000000001);
check('the receipt records payee identity, sku and tx', r.ok && r.payeeId === 'nathan.example.com' && r.sku === 'pro' && r.tx === '0xabc');
check('an x402 receipt names the chain and the address', r.rail === 'x402' && r.chain === 'eip155:84532' && r.payee === PAYEE);
check('a PAYPAL receipt names the rail and the derived payee, and no chain', (() => {
  const rp = C.receipt(s, 'PAYID-1', 1786000000002, 'paypal');
  return rp.rail === 'paypal' && rp.chain === null && rp.payee === 'payments@nathan.example.com';
})());

check('a decline is a named, normal outcome', C.DECLINED === 'DECLINED_BY_USER');

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
process.exit(failures ? 1 : 0);
