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
  const build = async (appId, caps, extra) => sign.signDomain(await gif.encode({
    'manifest.json': JSON.stringify(Object.assign({ gifos: '1.0', appId, name: appId, entry: 'index.html', capabilities: caps }, extra || {})),
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
  const answer = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fakeFetch = async (url, opts) => {
    const u = String(url);
    seen.push({ url: u, body: opts && opts.body ? String(opts.body) : null });
    if (u === 'https://' + DOMAIN + '/gifos.key') return keyUp ? new Response(publicKeyB64, { status: 200 }) : new Response('down', { status: 503 });
    if (u.endsWith('/v1/oauth2/token')) return answer(200, { access_token: 'tok' });
    if (u.endsWith('/v2/checkout/orders')) return answer(201, { id: 'ORDER-1', links: [{ rel: 'approve', href: 'https://paypal.example/approve?token=ORDER-1' }] });
    if (u === 'https://registry.example/registry.json') return answer(200, { registered: { [DOMAIN]: { until: null } } });
    if (u === 'https://rpc.example/') return answer(200, { jsonrpc: '2.0', id: 1, result: '0x10' });
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

  // ---- the author's key -----------------------------------------------------------
  keyUp = false;
  const down = await post(core(), '/rails', { proof: proofs.usdc });
  check('an unreachable author key is a 503 to retry — never a pass', down.status === 503 && /could not be fetched/.test(down.body.error));

  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e); process.exit(1); });
