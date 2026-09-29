// A receipt names WHO WAS PAID, and a purchase belongs to that signer.
//
// The hole this guards (found 2026-09-29): once the pay Worker stopped
// consulting the store, any signer could be paid under any appId — and the
// receipt named only the appId. So an attacker signed their own app wearing a
// victim's appId, paid THEMSELVES a hundredth of a cent, and held a genuine
// gifos-signed receipt that unlocked the VICTIM's app for whoever opened the
// file. Every case here is that attack or a neighbour of it, run against the
// real makeCore and the real OS broker with a stubbed network (tier 1,
// docs/payments-testing.md):
//   - every rail's receipt carries payeeId + payeeType, the VERIFIED signer;
//   - a self-dealt receipt grants the attacker's own app, never the victim's;
//   - a colliding app cannot take, read or block the victim's purchase slot;
//   - a receipt that names no signer is refused by the OS and by /receipt/file;
//   - a receipt is read only by naming the identity the payment was made to.
const path = require('path');
const { webcrypto } = require('crypto');
const ROOT = path.join(__dirname, '..', '..');

// Browser-ish globals for the broker.
const lsm = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsm.has(k) ? lsm.get(k) : null), setItem: (k, v) => { lsm.set(k, String(v)); }, removeItem: (k) => { lsm.delete(k); },
  key: (i) => Array.from(lsm.keys())[i], get length() { return lsm.size; },
};
for (const f of ['gifos-gif.js', 'gifos-ed.js', 'gifos-sign.js', 'gifos-charge.js', 'gifos-purse.js', 'gifos-pay-broker.js']) require(path.join(ROOT, 'site', 'js', f));
const { gif, sign, payBroker } = globalThis.GifOS;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

const ATT = '0xdeadBEEFdeadBEEFdeadBEEFdeadBEEFdeadBEEF';
const VIC = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C';
const TREASURY = '0x1111111111111111111111111111111111111111';
const USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';

(async () => {
  const { makeCore } = await import(path.join(ROOT, 'pay', 'src', 'core.js'));
  const keys = {};   // domain -> published key, served by the stub below
  const mk = async (domain, manifest) => {
    const k = await sign.generateDomainKey();
    keys[domain] = k.publicKeyB64;
    const bytes = await sign.signDomain(await gif.encode({ 'manifest.json': JSON.stringify(manifest), 'index.html': domain }), domain, k.keyPair, 1786000000000);
    return { key: k.publicKeyB64, bytes, manifest, proof: await sign.proofOf(bytes) };
  };
  const RAILS = ['paypal', 'x402', 'transfer', 'fednow', 'mpp'];
  const victim = await mk('victim.example', { gifos: '1.0', appId: 'paid-shop', name: 'Paid Shop', entry: 'index.html', capabilities: { pay: RAILS }, pay: { to: VIC, prices: { pro: '5000000' } } });
  // An ordinary seller, for the rail-by-rail receipt checks further down.
  const SHOP = '0x3333333333333333333333333333333333333333';
  const shop = await mk('shop.example', { gifos: '1.0', appId: 'paid-shop', name: 'Paid Shop', entry: 'index.html', capabilities: { pay: RAILS }, pay: { to: SHOP, prices: { pro: '5000000', mid: '3000000' } } });
  // The attacker signs their OWN manifest, so they set their own price: 100 units.
  const attacker = await mk('evil.example', { gifos: '1.0', appId: 'paid-shop', name: 'Paid Shop', entry: 'index.html', capabilities: { pay: RAILS }, pay: { to: ATT, prices: { pro: '100' } } });

  // ---- the stubbed world: keys, PayPal, the facilitator, the chain, the bank, Stripe
  const kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const payPub = Buffer.from(await webcrypto.subtle.exportKey('raw', kp.publicKey)).toString('base64');
  const orders = new Map(), rfps = new Map();
  let chainLogs = [], stripeIntents = [];
  const J = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  const fakeFetch = async (url, opts) => {
    const u = String(url), body = opts && opts.body ? String(opts.body) : '';
    const km = /^https:\/\/([^/]+)\/gifos\.key$/.exec(u);
    if (km) return keys[km[1]] ? new Response(keys[km[1]]) : new Response('no key', { status: 404 });
    if (u === '/gifos-pay.key') return new Response(payPub);
    if (u === 'https://reg.example/r.json') return J({ registered: { 'victim.example': { until: null }, 'evil.example': { until: null }, 'long.example': { until: null }, 'shop.example': { until: null } } });
    if (u.endsWith('/v1/oauth2/token')) return J({ access_token: 't' });
    if (u.endsWith('/v2/checkout/orders')) {
      const unit = JSON.parse(body).purchase_units[0]; const id = 'ORD-' + (orders.size + 1);
      orders.set(id, { id, status: 'APPROVED', purchase_units: [unit] });
      return J({ id, links: [{ rel: 'approve', href: 'https://paypal.example/a?token=' + id }] }, 201);
    }
    let m = /\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/.exec(u);
    if (m) {
      const o = orders.get(m[1]); if (!o) return J({}, 404);
      if (m[2]) { o.status = 'COMPLETED'; o.purchase_units[0].payments = { captures: [{ id: 'CAP-' + o.id, amount: o.purchase_units[0].amount, custom_id: o.purchase_units[0].custom_id }] }; }
      return J(o);
    }
    if (u.endsWith('/verify')) return J({ isValid: true });
    if (u.endsWith('/settle')) return J({ success: true, transaction: '0xabc' });
    if (u === 'https://rpc.example/') {
      const q = JSON.parse(body);
      return J({ jsonrpc: '2.0', id: q.id, result: q.method === 'eth_blockNumber' ? '0x10' : chainLogs });
    }
    if (u === 'https://bank.example/rfp') { const b = JSON.parse(body); const id = 'RFP-' + (rfps.size + 1); rfps.set(id, Object.assign({ id, status: 'SETTLED', settlementId: 'FN-' + id }, b)); return J({ id }, 201); }
    m = /^https:\/\/bank\.example\/rfp\/(.+)$/.exec(u);
    if (m) return rfps.has(m[1]) ? J(rfps.get(m[1])) : J({}, 404);
    if (u.startsWith('https://stripe.example/v1/payment_intents/search')) return J({ data: stripeIntents });
    return new Response('unexpected ' + u, { status: 404 });
  };
  globalThis.fetch = fakeFetch;   // the broker's receipt-key fetch
  const H = makeCore({
    fetch: fakeFetch, subtle: webcrypto.subtle, feeBps: 300, treasuryAddress: TREASURY, treasuryEmail: 'payments@gifos.app',
    paypalBase: 'https://paypal.example', paypalClientId: 'id', paypalClientSecret: 's', paypalPartner: 'approved',
    facilitatorUrl: 'https://fac.example', rpcUrl: 'https://rpc.example/', registryUrl: 'https://reg.example/r.json',
    fednowApi: 'https://bank.example', fednowPayees: { 'victim.example': 'ACCT-V', 'evil.example': 'ACCT-E', 'long.example': 'ACCT-L', 'shop.example': 'ACCT-S' },
    stripeApi: 'https://stripe.example', stripeKey: 'sk_test_x', stripeProfileId: 'profile_test_x', mppSecret: 'm',
    stripePayees: { 'victim.example': 'acct_v', 'evil.example': 'acct_e', 'shop.example': 'acct_s' },
    returnBase: 'https://pay.example', signKey: { privateKey: kp.privateKey, publicKey: kp.publicKey },
  });
  const call = async (method, route, body) => {
    const r = await H(new Request('https://pay.example' + route, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }));
    let j = null; try { j = await r.clone().json(); } catch (e) {}
    return { status: r.status, body: j, raw: r };
  };
  const rc = (x) => (x.body && x.body.receiptJson ? JSON.parse(x.body.receiptJson) : {});
  const names = (r, who) => r.payeeId === who.id && r.payeeType === 'domain' && r.appId === 'paid-shop';
  const WHO = { evil: { id: 'evil.example' }, victim: { id: 'victim.example' }, shop: { id: 'shop.example' } };
  const q = (claim, id) => '?claim=' + claim + '&id=' + encodeURIComponent(id) + '&type=domain';
  const legs = (to, amount) => {
    const fee = (BigInt(amount) * 300n) / 10000n;
    const t = [{ to, amount: String(BigInt(amount) - fee), asset: USDC, network: 'eip155:84532' }, { to: TREASURY, amount: String(fee), asset: USDC, network: 'eip155:84532' }];
    return { transfers: t, payloads: t.map((x) => ({ signature: '0x00', authorization: { to: x.to, value: x.amount } })) };
  };

  // ---- THE ATTACK: self-deal under the victim's appId ---------------------------
  const deal = await call('POST', '/x402/settle', Object.assign({ proof: attacker.proof, sku: 'pro', amount: '100' }, legs(ATT, '100')));
  const dealt = rc(deal);
  check('the attacker CAN still pay themselves — and the receipt says exactly that: paid to evil.example',
    deal.status === 200 && names(dealt, WHO.evil) && dealt.payee === ATT, JSON.stringify(dealt));
  const file = await call('POST', '/receipt/file', { receiptJson: deal.body.receiptJson, sig: deal.body.sig });
  const arc = await gif.decode(new Uint8Array(await file.raw.arrayBuffer()));
  const ing = await payBroker.ingestReceiptFiles(arc.files);
  check('opening the self-dealt receipt registers a purchase FROM evil.example', ing.payeeId === 'evil.example');
  check('the VICTIM\'s genuine app is NOT entitled by it', (await payBroker.entitled(victim.manifest, 'pro', victim.bytes)) === false);
  check('…and its license() is null — the attacker\'s transaction is not the victim\'s buyer', (await payBroker.license(victim.manifest, 'pro', victim.bytes)) === null);
  check('the attacker\'s own app IS entitled — they bought from themselves', (await payBroker.entitled(attacker.manifest, 'pro', attacker.bytes)) === true);
  check('nothing was stored under the bare appId', !Array.from(lsm.keys()).some((k) => k === 'pay.ent:paid-shop:pro'), Array.from(lsm.keys()).filter((k) => k.indexOf('pay.ent:') === 0).join(' '));

  // ---- the slot cannot be poisoned: the victim's real sale still lands -----------
  const real = await call('POST', '/x402/settle', Object.assign({ proof: victim.proof, sku: 'pro', amount: '5000000' }, legs(VIC, '5000000')));
  const realFile = await call('POST', '/receipt/file', { receiptJson: real.body.receiptJson, sig: real.body.sig });
  await payBroker.ingestReceiptFiles((await gif.decode(new Uint8Array(await realFile.raw.arrayBuffer()))).files);
  check('a genuine purchase from victim.example lands beside the attacker\'s, and entitles the victim\'s app',
    names(rc(real), WHO.victim) && (await payBroker.entitled(victim.manifest, 'pro', victim.bytes)) === true);
  check('…with the GENUINE transaction as its license', (await payBroker.license(victim.manifest, 'pro', victim.bytes)) === '0xabc,0xabc');

  // ---- THE PRICE: the buyer does not name it ------------------------------------
  const under = await call('POST', '/x402/settle', Object.assign({ proof: victim.proof, sku: 'pro', amount: '100' }, legs(VIC, '100')));
  check('the VICTIM\'s own proof posted with amount "100" is refused: "pro" costs what the author signed',
    under.status === 403 && /costs 5000000/.test(under.body.error) && !under.body.receiptJson, under.body && under.body.error);

  // ---- a receipt that names nobody ------------------------------------------------
  const sigOf = async (obj) => {
    const receiptJson = JSON.stringify(obj);
    const s = new Uint8Array(await webcrypto.subtle.sign('Ed25519', kp.privateKey, Buffer.from(receiptJson)));
    return { receiptJson, sig: Buffer.from(s).toString('base64') };
  };
  const nameless = await sigOf({ v: 1, kind: 'gifos-pay-receipt', rail: 'x402', appId: 'paid-shop', sku: 'gold', amount: '100', payee: ATT, tx: '0xold', at: 1 });
  const before = lsm.size;
  const refused = await payBroker.ingestReceiptFiles({ 'receipt.json': JSON.stringify(nameless) }).then(() => false, (e) => /names no signing identity/.test(e.message));
  check('a GENUINELY SIGNED receipt with no payeeId is refused by the OS and grants nothing', refused && lsm.size === before);
  const pack = await call('POST', '/receipt/file', nameless);
  check('…and the Worker will not package one', pack.status === 403 && /names no signing identity/.test(pack.body.error));

  // ---- every rail's receipt names the verified signer -------------------------------
  // PayPal: the order remembers the identity's TAG; the receipt is read by naming it.
  const co = await call('POST', '/checkout', { proof: shop.proof, amount: '5000000', sku: 'pro', reason: 'x' });
  const asVictim = await call('GET', '/receipt/' + co.body.id + q(co.body.claim, 'victim.example'));
  check('PayPal: naming ANOTHER identity does not open the order — and nothing is captured',
    asVictim.status === 403 && /not the identity this payment was made to/.test(asVictim.body.error) && orders.get(co.body.id).status === 'APPROVED');
  const noWho = await call('GET', '/receipt/' + co.body.id + '?claim=' + co.body.claim);
  check('PayPal: naming NO identity does not open it either', noWho.status === 403 && orders.get(co.body.id).status === 'APPROVED');
  const badClaim = await call('GET', '/receipt/' + co.body.id + q('0'.repeat(32), 'shop.example'));
  check('PayPal: a wrong claim is refused BEFORE capture — an order id alone moves no money', badClaim.status === 403 && orders.get(co.body.id).status === 'APPROVED');
  const pp = await call('GET', '/receipt/' + co.body.id + q(co.body.claim, 'shop.example'));
  check('PayPal: the right claim and identity capture and sign a receipt naming the signer',
    pp.status === 200 && names(rc(pp), WHO.shop) && rc(pp).rail === 'paypal' && rc(pp).payee === 'payments@shop.example', JSON.stringify(rc(pp)));

  // Wallet transfer: the invoice token carries the identity.
  const inv = await call('POST', '/transfer/invoice', { proof: shop.proof, amount: '3000000', sku: 'mid' });
  const FROM = '0x' + '22'.repeat(20);
  const bound = await call('POST', '/transfer/bind', { token: inv.body.token, from: FROM });
  const pad = (a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
  chainLogs = [{ data: '0x' + BigInt(inv.body.expected).toString(16), topics: ['0xddf2', pad(FROM), pad(SHOP)], transactionHash: '0xt1' }];
  const tr = await call('POST', '/transfer/receipt', { token: bound.body.token });
  check('wallet transfer: the receipt names the signer', tr.status === 200 && names(rc(tr), WHO.shop) && rc(tr).rail === 'transfer', JSON.stringify(rc(tr)));

  // FedNow: claim + identity, like PayPal.
  const rfp = await call('POST', '/fednow/rfp', { proof: shop.proof, amount: '3000000', sku: 'mid', reason: 'x' });
  check('FedNow: the payment request returns a claim, and its reference fits the bank\'s field whole',
    rfp.status === 200 && /^[0-9a-f]{32}$/.test(rfp.body.claim) && rfps.get(rfp.body.id).reference.length <= 140 && !!JSON.parse(rfps.get(rfp.body.id).reference).i);
  const fnBare = await call('GET', '/fednow/receipt/' + rfp.body.id);
  check('FedNow: a request id alone reads nothing', fnBare.status === 403);
  const fnOther = await call('GET', '/fednow/receipt/' + rfp.body.id + q(rfp.body.claim, 'victim.example'));
  check('FedNow: naming another identity reads nothing', fnOther.status === 403);
  const fn = await call('GET', '/fednow/receipt/' + rfp.body.id + q(rfp.body.claim, 'shop.example'));
  check('FedNow: the receipt names the signer', fn.status === 200 && names(rc(fn), WHO.shop) && rc(fn).rail === 'fednow', JSON.stringify(rc(fn)));
  const long = await mk('long.example', { gifos: '1.0', appId: 'a'.repeat(64), name: 'x', entry: 'index.html', capabilities: { pay: ['fednow'] }, pay: { prices: { ['s'.repeat(64)]: '3000000' } } });
  const tooLong = await call('POST', '/fednow/rfp', { proof: long.proof, amount: '3000000', sku: 's'.repeat(64), reason: 'x' });
  check('FedNow: an appId and sku too long for the reference are refused BEFORE a request exists — never cut', tooLong.status === 400 && /too long together/.test(tooLong.body.error) && rfps.size === 1);

  // Agent rail: the offer carries the identity; the status lookup signs it.
  const offer = await call('POST', '/mpp/offer', { proof: shop.proof, amount: '5000000', sku: 'pro' });
  const oid = JSON.parse(Buffer.from(offer.body.token.split('.')[0], 'base64url').toString()).oid;
  stripeIntents = [{ id: 'pi_1', status: 'succeeded', amount: 500, currency: 'usd', created: 1790000000, metadata: { gifos_offer: oid }, transfer_data: { destination: 'acct_s' } }];
  const st = await call('POST', '/mpp/status', { offer: offer.body.token, claim: offer.body.claim });
  check('agent rail: the receipt names the signer, and is dated by the payment itself',
    st.body.status === 'COMPLETED' && names(rc(st), WHO.shop) && rc(st).rail === 'mpp' && rc(st).at === 1790000000000, JSON.stringify(rc(st)));
  stripeIntents = [{ id: 'pi_2', status: 'succeeded', amount: 500, currency: 'usd', metadata: { gifos_offer: oid }, transfer_data: { destination: 'acct_SOMEONE_ELSE' } }];
  check('agent rail: a payment that went to another account does not complete the offer',
    (await call('POST', '/mpp/status', { offer: offer.body.token, claim: offer.body.claim })).body.status === 'PENDING');
  stripeIntents = [{ id: 'pi_3', status: 'succeeded', amount: 500, currency: 'eur', metadata: { gifos_offer: oid }, transfer_data: { destination: 'acct_s' } }];
  check('agent rail: a payment in another currency does not complete the offer',
    (await call('POST', '/mpp/status', { offer: offer.body.token, claim: offer.body.claim })).body.status === 'PENDING');
  stripeIntents = [{ id: 'pi_4', status: 'requires_payment_method', amount: 500, currency: 'usd', metadata: { gifos_offer: oid } }];
  check('agent rail: a DECLINED attempt is reported FAILED, so the waiting sheet stops',
    (await call('POST', '/mpp/status', { offer: offer.body.token, claim: offer.body.claim })).body.status === 'FAILED');

  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e); process.exit(1); });
