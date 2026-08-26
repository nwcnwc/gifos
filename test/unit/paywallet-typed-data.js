// gifos-paywallet: what a wallet is ever asked to sign, checked before any
// wallet exists. Pure decisions over data (docs/payments-testing.md, tier 1):
// the EIP-3009 authorization and its EIP-712 typed data are built here from a
// transfer the broker validated, and every refusal fires without a provider,
// a chain, or a network.
const path = require('path');
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-paywallet.js'));
const W = globalThis.GifOS.payWallet;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const refuses = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

const FROM = '0xAbCd000000000000000000000000000000000001';
const TO = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C';
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const NONCE = new Uint8Array(32).fill(7);
const NOW = 1787700000000;
const T = (over) => Object.assign({ to: TO, amount: '2910000', asset: USDC, network: 'eip155:84532' }, over || {});

// ---- the authorization ------------------------------------------------------
const auth = W.buildAuthorization(T(), FROM, NONCE, NOW);
check('a valid transfer builds a complete authorization',
  auth.from === FROM && auth.to === TO && auth.value === '2910000' && auth.validAfter === '0');
check('the nonce is the 32 bytes given, hex-encoded',
  auth.nonce === '0x' + '07'.repeat(32), auth.nonce);
check('the validity window is 10 minutes from now, in SECONDS',
  auth.validBefore === String(Math.floor(NOW / 1000) + 600), auth.validBefore);

check('MAINNET is refused before any wallet sees anything',
  refuses(() => W.buildAuthorization(T({ network: 'eip155:8453' }), FROM, NONCE, NOW), /Base Sepolia only/));
check('a non-address recipient is refused',
  refuses(() => W.buildAuthorization(T({ to: 'payments@gifos.app' }), FROM, NONCE, NOW), /not an address/));
check('a non-address payer is refused',
  refuses(() => W.buildAuthorization(T(), 'someone', NONCE, NOW), /payer is not an address/));
check('a float amount is refused (no floats on money)',
  refuses(() => W.buildAuthorization(T({ amount: '2.91' }), FROM, NONCE, NOW), /decimal integer string/));
check('a zero amount is refused',
  refuses(() => W.buildAuthorization(T({ amount: '0' }), FROM, NONCE, NOW), /positive/));
check('a short nonce is refused — 32 bytes or nothing',
  refuses(() => W.buildAuthorization(T(), FROM, new Uint8Array(16), NOW), /32 bytes/));

// ---- the typed data ---------------------------------------------------------
const td = W.typedData(auth, USDC);
check('primaryType is TransferWithAuthorization', td.primaryType === 'TransferWithAuthorization');
check('the domain pins Base Sepolia and the token contract',
  td.domain.chainId === 84532 && td.domain.verifyingContract === USDC
  && td.domain.name === 'USDC' && td.domain.version === '2');
check('the message IS the authorization, verbatim', td.message === auth);
check('the type list matches EIP-3009 exactly',
  JSON.stringify(td.types.TransferWithAuthorization.map((f) => f.name))
  === JSON.stringify(['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce']));
check('a requirement extra can override the token domain (x402 carries it per token)',
  W.typedData(auth, USDC, { name: 'USD Coin', version: '1' }).domain.name === 'USD Coin');
check('a non-address asset is refused',
  refuses(() => W.typedData(auth, 'usdc'), /asset is not an address/));

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
process.exit(failures ? 1 : 0);
