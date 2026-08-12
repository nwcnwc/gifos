// gifos-x402: the wire format, and every refusal that guards it.
//
// A resource server is UNTRUSTED — it names its own price, chain, token and
// recipient. These cases are mostly adversarial on purpose: each one is a
// hostile quote that must be refused BEFORE a human is shown a prompt, because
// a refusal a person has to notice is not a control.
const path = require('path');
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-x402.js'));
const x = globalThis.GifOS.x402;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const PAYTO = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C';
const offer = (over) => Object.assign({
  scheme: 'exact', network: 'eip155:84532', amount: '10000',
  asset: USDC, payTo: PAYTO, maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' },
}, over || {});
const required = (accepts, over) => b64(Object.assign({
  x402Version: 2,
  error: 'PAYMENT-SIGNATURE header is required',
  resource: { url: 'https://api.example.com/premium-data', description: 'Premium data', serviceName: 'Example' },
  accepts,
}, over || {}));
const refuses = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

// ---- the happy path, against the spec's own example ------------------------
const pr = x.parsePaymentRequired(required([offer()]));
check('parses a spec-shaped PAYMENT-REQUIRED header', pr.x402Version === 2 && pr.accepts.length === 1);

const chosen = x.chooseRequirement(pr, { maxAmount: '50000' });
check('chooses an offer inside the ceiling', String(chosen.amount) === '10000' && chosen.requirement.payTo === PAYTO);

const d = x.describe(pr, chosen);
check('describes what the human must be shown before any prompt',
  d.amount === '10000' && d.asset === 'USDC' && d.payTo === PAYTO && /premium-data/.test(d.resourceUrl),
  [d.amount, d.asset, d.serviceName].join(' / '));

const hdr = x.encodePaymentPayload(chosen.requirement, { signature: '0xdeadbeef', authorization: {} });
const back = x.decodeHeader(hdr, 'PAYMENT-SIGNATURE');
check('encodes a PAYMENT-SIGNATURE header that round-trips',
  back.x402Version === 2 && back.scheme === 'exact' && back.network === 'eip155:84532' && back.payload.signature === '0xdeadbeef');

// ---- refusals: the hostile server ------------------------------------------
check('REFUSES a mainnet quote (network is pinned in code)',
  refuses(() => x.chooseRequirement(x.parsePaymentRequired(required([offer({ network: 'eip155:8453' })])), { maxAmount: '999999' }), /Base Sepolia only/));

check('REFUSES an unknown token on an allowed chain',
  refuses(() => x.chooseRequirement(x.parsePaymentRequired(required([offer({ asset: '0x1111111111111111111111111111111111111111' })])), { maxAmount: '999999' }), /not an allowed token/));

check('REFUSES a quote above the ceiling',
  refuses(() => x.chooseRequirement(x.parsePaymentRequired(required([offer({ amount: '10000000' })])), { maxAmount: '50000' }), /exceeds the ceiling/));

check('REFUSES everything when no ceiling is set (a new app pays nothing)',
  refuses(() => x.chooseRequirement(x.parsePaymentRequired(required([offer()])), { maxAmount: '0' }), /no spending ceiling/));

check('REFUSES an unsupported scheme', refuses(() => x.chooseRequirement(x.parsePaymentRequired(required([offer({ scheme: 'upto' })])), { maxAmount: '99999' }), /scheme "upto" unsupported/));

check('REFUSES a payTo that is not an address', refuses(() => x.chooseRequirement(x.parsePaymentRequired(required([offer({ payTo: 'me@example.com' })])), { maxAmount: '99999' }), /payTo is not an address/));

check('REFUSES a non-integer amount (no floats on money)',
  refuses(() => x.chooseRequirement(x.parsePaymentRequired(required([offer({ amount: '1.5' })])), { maxAmount: '99999' }), /decimal integer string/));

check('REFUSES a negative/zero amount',
  refuses(() => x.chooseRequirement(x.parsePaymentRequired(required([offer({ amount: '0' })])), { maxAmount: '99999' }), /must be positive/));

// A big-number quote must not become "small" through float rounding.
const huge = '9007199254740993'; // 2^53 + 1 — unrepresentable as a JS number
check('a quote beyond 2^53 is still compared exactly (BigInt, not float)',
  refuses(() => x.chooseRequirement(x.parsePaymentRequired(required([offer({ amount: huge })])), { maxAmount: '9007199254740992' }), /exceeds the ceiling/),
  huge + ' vs 2^53');

// ---- refusals: malformed input ---------------------------------------------
check('REFUSES a missing header', refuses(() => x.parsePaymentRequired(undefined), /missing PAYMENT-REQUIRED/));
check('REFUSES non-base64 / non-JSON', refuses(() => x.parsePaymentRequired('!!!!not base64!!!!'), /not valid (base64|JSON)/));
check('REFUSES a future protocol version rather than guessing',
  refuses(() => x.parsePaymentRequired(required([offer()], { x402Version: 3 })), /unsupported protocol version 3/));
check('REFUSES an empty accepts list', refuses(() => x.parsePaymentRequired(required([])), /lists no accepted payment/));

// ---- a mixed list: take the one we can pay, ignore the rest -----------------
const mixed = x.parsePaymentRequired(required([
  offer({ network: 'eip155:8453', amount: '1' }),  // mainnet — refused
  offer({ scheme: 'upto' }),                        // unsupported scheme
  offer({ amount: '2500' }),                        // this one
]));
const pick = x.chooseRequirement(mixed, { maxAmount: '3000' });
check('picks the payable offer out of a mixed list', String(pick.amount) === '2500', String(pick.amount));

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
process.exit(failures ? 1 : 0);
