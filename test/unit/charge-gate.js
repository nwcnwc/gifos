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
const ALL = ['paypal', 'x402', 'fednow', 'mpp'];
const manifest = (over) => Object.assign({ appId: 'shop', name: 'Shop', capabilities: { pay: ALL }, pay: { to: PAYEE, chain: 'eip155:84532' } }, over || {});
const FIAT_ONLY = { appId: 'x', capabilities: { pay: true } };
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
check('pay:true and no manifest.pay block => PayPal only, derived from the identity', (() => {
  const e = C.eligibility(VALID, FIAT_ONLY);
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
  (() => { const e2 = C.eligibility(VALID, FIAT_ONLY); const s2 = C.sheet(e2, ok, 'X');
           return s2.rails.x402 === null && s2.rails.paypal === 'payments@nathan.example.com'; })());

// ---- THE AUTHOR'S RAILS: capabilities.pay, out of the signed manifest ---------
// true = PayPal only; otherwise the author names every rail. A malformed list
// is a refusal — a typo must never widen or empty what the author meant.
check('"pay": true allows PayPal ONLY', JSON.stringify(C.railsAllowed(FIAT_ONLY)) === '["paypal"]');
check('a list allows exactly the rails it names, in the author\'s order',
  JSON.stringify(C.railsAllowed(manifest({ capabilities: { pay: ['fednow', 'x402'] } }))) === '["fednow","x402"]');
check('"transfer" is no longer a payment method (removed 2026-09-28) — listing it is refused, not ignored',
  refuses(() => C.railsAllowed(manifest({ capabilities: { pay: ['x402', 'transfer'] } })), /unknown payment method "transfer"/));
check('an EMPTY list is refused', refuses(() => C.railsAllowed(manifest({ capabilities: { pay: [] } })), /must be true \(PayPal only\) or a list/));
check('an UNKNOWN rail name is refused, not ignored', refuses(() => C.railsAllowed(manifest({ capabilities: { pay: ['paypal', 'venmo'] } })), /unknown payment method "venmo"/));
check('a DUPLICATE rail is refused', refuses(() => C.railsAllowed(manifest({ capabilities: { pay: ['x402', 'x402'] } })), /twice/));
check('"pay": false / a string / an object is refused', ['false', '"paypal"', '{}'].every((v) => refuses(() => C.railsAllowed(manifest({ capabilities: { pay: JSON.parse(v) } })))));
check('a CHAIN rail with no manifest.pay.to is refused — there is nobody to pay',
  refuses(() => C.railsAllowed({ appId: 'x', capabilities: { pay: ['paypal', 'x402'] } }), /allows x402 but manifest\.pay\.to names no address/));
check('eligibility carries the author\'s rails, and refuses a malformed list', (() => {
  const good = C.eligibility(VALID, manifest({ capabilities: { pay: ['x402'] } }));
  const badL = C.eligibility(VALID, manifest({ capabilities: { pay: ['cash'] } }));
  return good.allowed && JSON.stringify(good.rails) === '["x402"]' && badL.allowed === false && /unknown payment method/.test(badL.reason);
})());
check('the sheet draws ONLY the rails the author allowed — USDC-only has no PayPal button', (() => {
  const s2 = C.sheet(C.eligibility(VALID, manifest({ capabilities: { pay: ['x402'] } })), ok, 'Shop');
  return s2.rails.paypal === null && s2.rails.fednow === null && s2.rails.mpp === null && s2.rails.x402.address === PAYEE;
})());
check('…and PayPal-only has no chain button even with a pay.to in the manifest', (() => {
  const s2 = C.sheet(C.eligibility(VALID, manifest({ capabilities: { pay: true } })), ok, 'Shop');
  return s2.rails.paypal === 'payments@nathan.example.com' && s2.rails.x402 === null;
})());
check('the Worker\'s answer narrows further: an allowed rail it cannot process gets no button', (() => {
  const s2 = C.sheet(elig, ok, 'Shop', { paypal: false, x402: true, fednow: false, mpp: true });
  return s2.rails.paypal === null && s2.rails.fednow === null && !!s2.rails.x402 && !!s2.rails.mpp;
})());
check('…but can never ADD a rail the author did not allow', (() => {
  const s2 = C.sheet(C.eligibility(VALID, FIAT_ONLY), ok, 'X', { paypal: true, x402: true, fednow: true, mpp: true });
  return !!s2.rails.paypal && s2.rails.x402 === null && s2.rails.fednow === null && s2.rails.mpp === null;
})());
check('the AGENT rail gets a sheet button when the author allowed it and the Worker can take it', (() => {
  const on = C.sheet(elig, ok, 'Shop', { mpp: true });
  const off = C.sheet(elig, ok, 'Shop', { mpp: false });
  return on.rails.mpp && on.rails.mpp.identity === 'nathan.example.com' && off.rails.mpp === null;
})());

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
