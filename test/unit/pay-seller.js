// pay/src/core.js with NO store: the seller comes from the app's signature.
//
// makeCore() driven directly, in Node, with a stubbed network: the author's
// gifos.key, PayPal, the rails registry and the chain RPC are answered here.
// Real apps are built and signed with gifos-sign.js, and their proofs are
// what each request carries. What is proven is the Worker's side of the
// contract: the payee and the rails come from the SIGNED manifest, a rail the
// author did not list is refused, a tampered proof is refused, the kill
// switch refuses, and /rails reports what the sheet may draw
// (docs/payments-testing.md, tier 1 — no browser, no Worker runtime).
const path = require('path');
const { webcrypto } = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
require(path.join(ROOT, 'site', 'js', 'gifos-gif.js'));
require(path.join(ROOT, 'site', 'js', 'gifos-ed.js'));
require(path.join(ROOT, 'site', 'js', 'gifos-sign.js'));
const { gif, sign } = globalThis.GifOS;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const clone = (o) => JSON.parse(JSON.stringify(o));

const DOMAIN = 'author.example.com';
const AUTHOR = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C';
const THIEF = '0xdeadBEEFdeadBEEFdeadBEEFdeadBEEFdeadBEEF';
const TREASURY = '0x1111111111111111111111111111111111111111';

(async () => {
  const { makeCore } = await import(path.join(ROOT, 'pay', 'src', 'core.js'));
  const { keyPair, publicKeyB64 } = await sign.generateDomainKey();
  // Every test app prices the skus the cases below buy (manifest.pay.prices).
  const PRICES = { pro: '5000000', agentpack: '5000000', retry: '5000000' };
  const build = async (appId, caps, extra) => sign.signDomain(await gif.encode({
    'manifest.json': JSON.stringify(Object.assign({ gifos: '1.0', appId, name: appId, entry: 'index.html', capabilities: caps }, extra ? Object.assign({}, extra, { pay: Object.assign({ prices: PRICES }, extra.pay) }) : {})),
    'index.html': '<p>' + appId + '</p>',
  }), DOMAIN, keyPair, 1786000000000);
  const proofs = {
    usdc: await sign.proofOf(await build('usdc-shop', { pay: ['x402', 'transfer'] }, { pay: { to: AUTHOR } })),
    paypal: await sign.proofOf(await build('paypal-shop', { pay: true }, { pay: { to: AUTHOR } })),
    all: await sign.proofOf(await build('every-rail', { pay: ['paypal', 'x402', 'transfer', 'fednow', 'mpp'] }, { pay: { to: AUTHOR } })),
    nopay: await sign.proofOf(await build('no-pay-cap', { db: true })),
    badrails: await sign.proofOf(await build('bad-rails', { pay: ['paypal', 'venmo'] })),
  };

  // ---- the stubbed network ----------------------------------------------------
  const seen = [];
  let keyUp = true;
  let searchData = [];
  let stripeAnswer = null;   // what POST /v1/payment_intents answers next
  let fac = { verifyFails: -1, settleFails: -1, verified: 0, settled: 0 };   // the x402 facilitator: which leg (by call order) fails
  const answer = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fakeFetch = async (url, opts) => {
    const u = String(url);
    seen.push({ url: u, body: opts && opts.body ? String(opts.body) : null });
    if (u === 'https://' + DOMAIN + '/gifos.key') return keyUp ? new Response(publicKeyB64, { status: 200 }) : new Response('down', { status: 503 });
    if (u.endsWith('/v1/oauth2/token')) return answer(200, { access_token: 'tok' });
    if (u.endsWith('/v2/checkout/orders')) return answer(201, { id: 'ORDER-1', links: [{ rel: 'approve', href: 'https://paypal.example/approve?token=ORDER-1' }] });
    if (u === 'https://registry.example/registry.json') return answer(200, { registered: { [DOMAIN]: { until: null } } });
    if (u === 'https://facilitator.example/verify') { const n = fac.verified++; return answer(200, { isValid: n !== fac.verifyFails }); }
    if (u === 'https://facilitator.example/settle') { const n = fac.settled++; return n === fac.settleFails ? answer(200, { success: false, errorReason: 'insufficient_funds' }) : answer(200, { success: true, transaction: '0xleg' + n }); }
    if (u === 'https://rpc.example/') return answer(200, { jsonrpc: '2.0', id: 1, result: '0x10' });
    if (u.startsWith('https://stripe.example/v1/payment_intents/search')) return answer(200, { data: searchData });
    if (u === 'https://stripe.example/v1/payment_intents') {
      const a = stripeAnswer(new URLSearchParams(opts.body), opts.headers);
      return new Response(JSON.stringify(a.body), { status: a.status, headers: Object.assign({ 'Content-Type': 'application/json' }, a.replayed ? { 'idempotent-replayed': 'true' } : {}) });
    }
    if (u.startsWith('https://gifos.app/')) return answer(500, 'THE STORE WAS CONSULTED');
    return answer(404, 'unexpected ' + u);
  };
  const kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const base = {
    fetch: fakeFetch, subtle: webcrypto.subtle,
    paypalBase: 'https://paypal.example', paypalClientId: 'id', paypalClientSecret: 'secret', paypalPartner: 'approved',
    treasuryEmail: 'payments@gifos.app', treasuryAddress: TREASURY, feeBps: 300,
    returnBase: 'https://pay.example', facilitatorUrl: 'https://facilitator.example', rpcUrl: 'https://rpc.example/',
    registryUrl: 'https://registry.example/registry.json',
    stripeApi: 'https://stripe.example', stripeKey: 'sk_test_x', stripeProfileId: 'profile_test_x', mppSecret: 's',
    stripePayees: { [DOMAIN]: 'acct_test_author' }, fednowPayees: {},
    signKey: { privateKey: kp.privateKey, publicKey: kp.publicKey },
  };
  const core = (over) => makeCore(Object.assign({}, base, over || {}));
  const post = async (h, route, body) => {
    const r = await h(new Request('https://pay.example' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    let j = null; try { j = await r.clone().json(); } catch (e) {}
    return { status: r.status, body: j };
  };
  const H = core();

  // ---- /rails: what the sheet may draw ------------------------------------------
  const rUsdc = await post(H, '/rails', { proof: proofs.usdc });
  check('/rails reads the author\'s list from the SIGNED manifest', rUsdc.status === 200 && JSON.stringify(rUsdc.body.allowed) === '["x402","transfer"]' && rUsdc.body.payingTo === DOMAIN, JSON.stringify(rUsdc.body && rUsdc.body.allowed));
  check('…USDC-only: PayPal and FedNow closed as NOT ALLOWED, x402 and transfer open',
    rUsdc.body.rails.paypal.ok === false && /does not accept PayPal/.test(rUsdc.body.rails.paypal.why)
    && rUsdc.body.rails.fednow.ok === false && rUsdc.body.rails.x402.ok === true && rUsdc.body.rails.transfer.ok === true, JSON.stringify(rUsdc.body.rails));
  const rPp = await post(H, '/rails', { proof: proofs.paypal });
  check('"pay": true -> PayPal ONLY, even though the manifest carries a pay.to',
    JSON.stringify(rPp.body.allowed) === '["paypal"]' && rPp.body.rails.paypal.ok === true && rPp.body.rails.x402.ok === false && rPp.body.rails.transfer.ok === false);
  const rPending = await post(core({ paypalPartner: 'pending' }), '/rails', { proof: proofs.paypal });
  check('while PayPal\'s partner approval is pending, the PayPal rail reports closed and says why',
    rPending.body.rails.paypal.ok === false && /approves GifOS as a platform partner/.test(rPending.body.rails.paypal.why));
  const rAll = await post(core({ fednowApi: 'https://fednow.example' }), '/rails', { proof: proofs.all });
  check('an allowed rail the deployment cannot serve is closed with the reason (FedNow: not registered with the provider)',
    rAll.body.rails.fednow.ok === false && /not registered for bank payments/.test(rAll.body.rails.fednow.why) && rAll.body.rails.mpp.ok === true);
  check('the STORE was never fetched', !seen.some((s) => s.url.startsWith('https://gifos.app/')));

  // ---- refusals: proof, capability, rails -----------------------------------
  const noProof = await post(H, '/checkout', { appId: 'paypal-shop', amount: '5000000', reason: 'x' });
  check('a checkout with NO proof is refused — an appId alone buys nothing', noProof.status === 400 && /signature proof/.test(noProof.body.error));
  const edited = clone(proofs.paypal);
  edited.manifest = Buffer.from(JSON.stringify({ gifos: '1.0', appId: 'paypal-shop', name: 'x', entry: 'index.html', capabilities: { pay: true }, pay: { to: THIEF } })).toString('base64');
  const tam = await post(H, '/checkout', { proof: edited, amount: '5000000', reason: 'x' });
  check('a TAMPERED proof is refused before PayPal is asked', tam.status === 403 && /does not verify/.test(tam.body.error) && !seen.some((s) => s.url.endsWith('/v2/checkout/orders')));
  const unsigned = await post(H, '/rails', { proof: Object.assign(clone(proofs.paypal), { sig: null }) });
  check('an UNSIGNED app is refused', unsigned.status === 403 && /not signed/.test(unsigned.body.error));
  const noCap = await post(H, '/rails', { proof: proofs.nopay });
  check('a signed app WITHOUT the pay capability is refused', noCap.status === 403 && /did not declare the "pay" capability/.test(noCap.body.error));
  const badRails = await post(H, '/rails', { proof: proofs.badrails });
  check('a signed app with a MALFORMED rails list is refused, not guessed at', badRails.status === 403 && /unknown payment method "venmo"/.test(badRails.body.error));
  const ppOnUsdc = await post(H, '/checkout', { proof: proofs.usdc, amount: '5000000', reason: 'x' });
  check('PayPal checkout for a USDC-only app is refused by NAME — the sheet was skipped, the Worker still says no',
    ppOnUsdc.status === 403 && /does not accept PayPal/.test(ppOnUsdc.body.error), ppOnUsdc.body && ppOnUsdc.body.error);
  const invOnPp = await post(H, '/transfer/invoice', { proof: proofs.paypal, amount: '3000000' });
  check('a wallet transfer to a PayPal-only app is refused, pay.to or not', invOnPp.status === 403 && /does not accept USDC wallet transfers/.test(invOnPp.body.error));
  const settleThief = await post(H, '/x402/settle', { proof: proofs.usdc, amount: '1000000', transfers: [{ to: THIEF, amount: '970000' }, { to: TREASURY, amount: '30000' }], payloads: [{}, {}] });
  check('x402 paying anyone but the SIGNED pay.to is refused', settleThief.status === 403 && /signed manifest names/.test(settleThief.body.error));

  // ---- the allowed path --------------------------------------------------------
  seen.length = 0;
  const pp = await post(H, '/checkout', { proof: proofs.paypal, amount: '5000000', reason: 'Unlock', sku: 'pro' });
  const order = seen.find((s) => s.url.endsWith('/v2/checkout/orders'));
  const unit = order ? JSON.parse(order.body).purchase_units[0] : {};
  check('a PayPal-allowed app gets its order, paid to the identity it was signed by',
    pp.status === 200 && pp.body.id === 'ORDER-1' && unit.payee && unit.payee.email_address === 'payments@' + DOMAIN
    && JSON.parse(unit.custom_id).a === 'paypal-shop', JSON.stringify(unit.payee));
  const cheap = await post(H, '/checkout', { proof: proofs.paypal, amount: '10000', reason: 'Unlock', sku: 'pro' });
  check('a sku posted at a price the author did not sign is refused — the buyer does not name the price',
    cheap.status === 403 && /costs 5000000/.test(cheap.body.error), cheap.body && cheap.body.error);
  const unpriced = await post(H, '/checkout', { proof: proofs.paypal, amount: '5000000', reason: 'Unlock', sku: 'platinum' });
  check('…and a sku the manifest does not price is not sold at all', unpriced.status === 403 && /sets no price for "platinum"/.test(unpriced.body.error));
  const tip = await post(H, '/checkout', { proof: proofs.paypal, amount: '10000', reason: 'Tip' });
  check('a tip (no sku) is any amount', tip.status === 200);
  const pend = await post(core({ paypalPartner: 'pending' }), '/checkout', { proof: proofs.paypal, amount: '5000000', reason: 'x' });
  check('…and while partner approval is pending, checkout says so plainly instead of a PayPal 422', pend.status === 503 && /platform partner/.test(pend.body.error));
  const inv = await post(H, '/transfer/invoice', { proof: proofs.usdc, amount: '3000000', sku: null });
  check('a USDC-allowed app gets a transfer invoice naming the SIGNED payee', inv.status === 200 && inv.body.payTo === AUTHOR && !!inv.body.token);
  const offer = await post(H, '/mpp/offer', { proof: proofs.all, amount: '5000000', sku: 'agentpack' });
  check('an mpp-allowed app gets a signed agent-checkout link', offer.status === 200 && /^https:\/\/pay\.example\/mpp\/charge\/[\w-]+\.[\w-]+$/.test(offer.body.url), offer.body && offer.body.url);
  const offerNo = await post(H, '/mpp/offer', { proof: proofs.usdc, amount: '5000000' });
  check('…an app that did not allow the agent rail gets none', offerNo.status === 403 && /does not accept AI-agent payments/.test(offerNo.body.error));
  const ch = await H(new Request(offer.body.url));
  check('the offer link answers an agent with a 402 Payment challenge', ch.status === 402 && /^Payment /.test(ch.headers.get('www-authenticate') || ''));
  const forged = await H(new Request(offer.body.url.replace(/\.[\w-]+$/, '.AAAA')));
  check('a forged offer link is not a checkout', forged.status === 404);

  // ---- the OS sheet's wait: /mpp/status ------------------------------------
  const oid = JSON.parse(Buffer.from(offer.body.token.split('.')[0], 'base64url').toString()).oid;
  check('an offer carries an id to find its payment by, and a claim only its caller holds',
    /^[0-9a-f]{24}$/.test(oid) && /^[0-9a-f]{32}$/.test(offer.body.claim) && !offer.body.url.includes(offer.body.claim));
  const st = (claim) => post(H, '/mpp/status', { offer: offer.body.token, claim });
  const wrong = await st('0'.repeat(32));
  check('the wait answers only to the claim the offer was minted with', wrong.status === 403);
  const waiting = await st(offer.body.claim);
  check('nothing paid yet -> PENDING', waiting.status === 200 && waiting.body.status === 'PENDING');
  searchData = [{ id: 'pi_wrong', status: 'succeeded', amount: 1, metadata: { gifos_offer: oid } }];
  check('a payment for the WRONG amount does not complete the offer', (await st(offer.body.claim)).body.status === 'PENDING');
  searchData = [{ id: 'pi_live_1', status: 'succeeded', amount: 500, currency: 'usd', metadata: { gifos_offer: oid }, transfer_data: { destination: 'acct_test_author' } }];
  const paidNow = await st(offer.body.claim);
  const rec = paidNow.body && paidNow.body.receiptJson ? JSON.parse(paidNow.body.receiptJson) : {};
  check('once the agent has paid, the wait returns the signed receipt for exactly that offer',
    paidNow.body.status === 'COMPLETED' && rec.rail === 'mpp' && rec.tx === 'pi_live_1' && rec.sku === 'agentpack' && rec.amount === '5000000' && rec.payeeId === DOMAIN && rec.appId === 'every-rail', JSON.stringify(rec));
  searchData = [];

  // A payment is still ANSWERED FOR after its link can no longer be paid.
  const realNow = Date.now;
  Date.now = () => realNow() + 31 * 60 * 1000;
  const lateCharge = await H(new Request(offer.body.url));
  searchData = [{ id: 'pi_live_1', status: 'succeeded', amount: 500, currency: 'usd', metadata: { gifos_offer: oid }, transfer_data: { destination: 'acct_test_author' } }];
  const lateAsk = await st(offer.body.claim);
  Date.now = () => realNow() + 26 * 60 * 60 * 1000;
  const tooLate = await st(offer.body.claim);
  Date.now = realNow;
  searchData = [];
  check('after 30 minutes the link can no longer be PAID…', lateCharge.status === 410);
  check('…but a payment made on it is still reported, with its receipt', lateAsk.status === 200 && lateAsk.body.status === 'COMPLETED' && !!lateAsk.body.receiptJson, lateAsk.status + ' ' + JSON.stringify(lateAsk.body).slice(0, 80));
  check('…until a day later, when the link is forgotten', tooLate.status === 410);

  const protoApp = await sign.proofOf(await build('__proto__', { pay: true }, { pay: {} }));
  const proto = await post(H, '/rails', { proof: protoApp });
  check('an appId that names something every object already owns is refused', proto.status === 403 && /no usable appId/.test(proto.body.error));

  // ---- the agent pays the link: retry, second token, decline -------------------
  // What `link-cli mpp pay` does: take the 402 challenge, answer it with a
  // credential carrying a Stripe Link token.
  const payLink = async (h, url, spt) => {
    const c = await h(new Request(url));
    const p = Object.fromEntries([...String(c.headers.get('www-authenticate')).slice('Payment '.length).matchAll(/(\w+)="((?:[^"\\]|\\.)*)"/g)].map((m) => [m[1], m[2].replace(/\\(.)/g, '$1')]));
    const ch = { id: p.id, realm: p.realm, method: p.method, intent: p.intent, request: p.request, expires: p.expires, description: p.description };
    const r = await h(new Request(url, { headers: { Authorization: 'Payment ' + Buffer.from(JSON.stringify({ challenge: ch, payload: { spt } })).toString('base64url') } }));
    let j = null; try { j = await r.clone().json(); } catch (e) {}
    return { status: r.status, body: j, receipt: j && j.receiptJson ? JSON.parse(j.receiptJson) : null };
  };
  const link = (await post(H, '/mpp/offer', { proof: proofs.all, amount: '5000000', sku: 'retry' })).body;
  const linkOid = JSON.parse(Buffer.from(link.token.split('.')[0], 'base64url').toString()).oid;
  const settledPi = { id: 'pi_once', status: 'succeeded', amount: 500, currency: 'usd', created: 1790000000, metadata: { gifos_offer: linkOid }, transfer_data: { destination: 'acct_test_author' } };
  let sentKey = null;
  stripeAnswer = (form, headers) => { sentKey = headers['Idempotency-Key']; return { status: 200, body: settledPi }; };
  const first = await payLink(H, link.url, 'spt_a');
  check('the agent pays the link once: settled, a receipt naming the signer, keyed to the offer',
    first.status === 200 && first.receipt.tx === 'pi_once' && first.receipt.payeeId === DOMAIN && first.receipt.payeeType === 'domain' && sentKey === 'gifos_offer_' + linkOid, JSON.stringify(first.receipt));
  stripeAnswer = () => ({ status: 200, body: settledPi, replayed: true });
  const retry = await payLink(H, link.url, 'spt_a');
  check('the agent RETRYING after a lost answer gets the SAME receipt — money taken is never left without one',
    retry.status === 200 && retry.body.receiptJson === first.body.receiptJson, retry.status + ' ' + JSON.stringify(retry.body).slice(0, 120));
  stripeAnswer = () => ({ status: 400, body: { error: { type: 'idempotency_error', message: 'Keys for idempotent requests can only be used with the same parameters they were first used with.' } } });
  const second = await payLink(H, link.url, 'spt_b');
  check('a SECOND token on the same link is refused — one link, one payment — and no receipt is issued',
    second.status === 402 && second.body.type === 'invalid-challenge' && /one link, one payment/.test(second.body.detail) && !second.body.receiptJson, JSON.stringify(second.body));
  stripeAnswer = () => ({ status: 402, body: { error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.' } }, replayed: true });
  const declined = await payLink(H, link.url, 'spt_a');
  check('a link whose one attempt was DECLINED says so, and says to ask for a new link — never "already paid"',
    declined.status === 402 && declined.body.type === 'verification-failed' && /refused by Stripe/.test(declined.body.detail) && /new link/.test(declined.body.detail) && !/already used|already paid/.test(declined.body.detail), JSON.stringify(declined.body));
  stripeAnswer = () => ({ status: 200, body: Object.assign({}, settledPi, { metadata: { gifos_offer: 'someone-elses' } }), replayed: true });
  const foreign = await payLink(H, link.url, 'spt_a');
  check('a replayed payment that is NOT this offer\'s earns no receipt', foreign.status === 402 && !foreign.body.receiptJson);
  const expired = await H(new Request(link.url.replace(/\/mpp\/charge\/.*/, '/mpp/charge/%E0%A4%A')));
  check('a malformed link is a 404, not a crash', expired.status === 404);

  // ---- x402: nothing moves unless everything can, and a paid buyer is never left bare
  const USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
  const BUYER = '0x' + '77'.repeat(20);
  const x402 = (amount) => {
    const fee = (BigInt(amount) * 300n) / 10000n;
    const t = [{ to: AUTHOR, amount: String(BigInt(amount) - fee), asset: USDC, network: 'eip155:84532' }, { to: TREASURY, amount: String(fee), asset: USDC, network: 'eip155:84532' }];
    return { proof: proofs.usdc, amount, sku: 'pro', transfers: t, payloads: t.map((x, i) => ({ signature: '0x00', authorization: { from: BUYER, to: x.to, value: x.amount, nonce: '0x' + String(i + 1).padStart(64, '0') } })) };
  };
  const rcpt = (r) => (r.body && r.body.receiptJson ? JSON.parse(r.body.receiptJson) : null);
  fac = { verifyFails: -1, settleFails: -1, verified: 0, settled: 0 };
  const paid = await post(H, '/x402/settle', x402('5000000'));
  check('an x402 purchase settles both legs — the FEE leg first — and the receipt names the signer, the payer and both transactions (author, fee)',
    paid.status === 200 && rcpt(paid).payeeId === DOMAIN && rcpt(paid).payer === BUYER && rcpt(paid).tx === '0xleg1,0xleg0' && rcpt(paid).feeCollected === undefined && rcpt(paid).payee === AUTHOR, JSON.stringify(rcpt(paid)));
  fac = { verifyFails: 1, settleFails: -1, verified: 0, settled: 0 };
  const unverifiable = await post(H, '/x402/settle', x402('5000000'));
  check('if the FEE leg cannot be verified, NOTHING is settled — not even the author leg', unverifiable.status === 502 && fac.settled === 0 && !unverifiable.body.receiptJson);
  fac = { verifyFails: -1, settleFails: 0, verified: 0, settled: 0 };
  const feeFails = await post(H, '/x402/settle', x402('5000000'));
  check('if the FEE leg (settled first) fails, nothing moved, the author leg is never tried, and there is no receipt',
    feeFails.status === 502 && fac.settled === 1 && !feeFails.body.receiptJson);
  fac = { verifyFails: -1, settleFails: 1, verified: 0, settled: 0 };
  const authorFails = await post(H, '/x402/settle', x402('5000000'));
  check('a payer who cannot cover BOTH legs gets NO receipt — the 3% cannot be skipped by funding the author leg alone',
    authorFails.status === 502 && fac.settled === 2 && !authorFails.body.receiptJson);
  fac = { verifyFails: -1, settleFails: -1, verified: 0, settled: 0 };
  const twoPayers = x402('5000000'); twoPayers.payloads[1].authorization.from = '0x' + '88'.repeat(20);
  const split = await post(H, '/x402/settle', twoPayers);
  check('a fee leg signed by ANOTHER wallet is refused before anything settles', split.status === 400 && /same payer/.test(split.body.error) && fac.settled === 0);
  const sameNonce = x402('5000000'); sameNonce.payloads[1].authorization.nonce = sameNonce.payloads[0].authorization.nonce;
  const reused = await post(H, '/x402/settle', sameNonce);
  check('two legs under ONE nonce are refused before anything settles', reused.status === 400 && /own nonce/.test(reused.body.error) && fac.settled === 0);
  const objSku = await post(H, '/x402/settle', Object.assign(x402('5000000'), { sku: { toString: 1 } }));
  check('a sku that is not a string is a 400, not a crash', objSku.status === 400 && /bad sku/.test(objSku.body.error));
  fac = { verifyFails: -1, settleFails: -1, verified: 0, settled: 0 };

  // ---- the author's key is fetched only from a public name ---------------------------
  const priv = await sign.proofOf(await sign.signDomain(await gif.encode({ 'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'x', name: 'x', entry: 'index.html', capabilities: { pay: true } }), 'index.html': 'x' }), 'db.corp.internal', keyPair, 1));
  seen.length = 0;
  const internal = await post(H, '/rails', { proof: priv });
  check('a signer under a private-only name (…​.internal) is never fetched',
    internal.status === 503 && /not a public domain/.test(internal.body.error) && !seen.some((x) => x.url.indexOf('internal') !== -1), internal.body && internal.body.error);
  const gone404 = await sign.proofOf(await sign.signDomain(await gif.encode({ 'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'x', name: 'x', entry: 'index.html', capabilities: { pay: true } }), 'index.html': 'x' }), 'nokey.example.org', keyPair, 1));
  const noKey = await post(H, '/rails', { proof: gone404 });
  check('what the chosen host answered is NOT echoed to the caller (no status-code oracle)', noKey.status === 503 && !/404|HTTP/.test(noKey.body.error), noKey.body && noKey.body.error);

  // ---- a payee map is not dodged by re-casing the identity ----------------------------
  const cased = await post(core({ stripePayees: { 'AUTHOR.Example.COM': 'acct_test_author' } }), '/rails', { proof: proofs.all });
  check('identity lookups ignore case', cased.status === 200 && cased.body.rails.mpp.ok === true);

  // ---- oversized bodies -----------------------------------------------------------
  const huge = await H(new Request('https://pay.example/rails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proof: { visual: 'A'.repeat(5 * 1024 * 1024) } }) }));
  check('a request body over the cap is refused (413) before any proof is checked', huge.status === 413);
  const lied = await H(new Request('https://pay.example/rails', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '99999999' }, body: '{}' }));
  check('…and a declared Content-Length over the cap is refused unread', lied.status === 413);

  // ---- the kill switch ----------------------------------------------------------
  const blockedAll = core({ blocked: [DOMAIN] });
  const b1 = await post(blockedAll, '/checkout', { proof: proofs.paypal, amount: '5000000', reason: 'x' });
  const b2 = await post(blockedAll, '/rails', { proof: proofs.usdc });
  check('BLOCKING an identity refuses every payment to it, on every route', b1.status === 403 && /blocked on GifOS/.test(b1.body.error) && b2.status === 403);
  const blockedOne = core({ blocked: [DOMAIN + '/usdc-shop'] });
  const b3 = await post(blockedOne, '/rails', { proof: proofs.usdc });
  const b4 = await post(blockedOne, '/rails', { proof: proofs.paypal });
  check('blocking ONE app ("identity/appId") leaves the author\'s other apps payable', b3.status === 403 && b4.status === 200);
  const b5 = await blockedAll(new Request(offer.body.url));
  check('a block also kills offers minted BEFORE it', b5.status === 403);

  // A DOMAIN entry covers its subdomains; config that would fail silently does not start.
  const parent = await post(core({ blocked: ['example.com'] }), '/rails', { proof: proofs.usdc });
  check('blocking a domain blocks every name under it (author.example.com under example.com)', parent.status === 403 && /blocked on GifOS/.test(parent.body.error));
  const lookalike = await post(core({ blocked: ['ample.com', 'thor.example.com'] }), '/rails', { proof: proofs.usdc });
  check('…but not a name that merely ENDS the same way', lookalike.status === 200);
  const throws = (cfg2) => { try { core(cfg2); return false; } catch (e) { return /must be a JSON/.test(e.message); } };
  check('BLOCKED written as a STRING refuses to start — it would have blocked nobody, silently', throws({ blocked: 'author.example.com' }));
  check('BLOCKED written as an OBJECT refuses to start', throws({ blocked: {} }));
  check('a payee map that is not identity -> account refuses to start', throws({ stripePayees: ['acct_x'] }) && throws({ fednowPayees: 'x' }));

  // ---- the author's key -----------------------------------------------------------
  keyUp = false;
  const down = await post(core(), '/rails', { proof: proofs.usdc });
  check('an unreachable author key is a 503 to retry — never a pass', down.status === 503 && /could not be fetched/.test(down.body.error));

  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e); process.exit(1); });
