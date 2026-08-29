// pay/src/mpp.js: the Machine Payments Protocol wire, and every refusal on it.
//
// An agent's wallet (Stripe Link, `link-cli mpp pay`) is the only client, and
// the challenge it echoes back is attacker-editable bytes. So the cases here
// are hostile on purpose: an edited amount, another server's challenge, a
// stale one, a malformed one — each must be refused BEFORE a Shared Payment
// Token is ever sent to Stripe. Pure: no Stripe, no network, no money
// (docs/payments-testing.md, tier 1).
const path = require('path');
const { webcrypto } = require('crypto');

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const rejects = async (p, re) => { try { await p; return false; } catch (e) { return re ? re.test(e.type + ': ' + e.message) : true; } };

(async () => {
  const { makeMpp } = await import(path.join(__dirname, '..', '..', 'pay', 'src', 'mpp.js'));
  const M = makeMpp({ subtle: webcrypto.subtle });
  const SECRET = 'test-secret';
  const REALM = 'pay.gifos.app';
  const request = {
    amount: '500', currency: 'usd', description: 'GifOS charge: paytest / pro',
    externalId: '{"a":"paytest","s":"pro","u":"5000000"}',
    methodDetails: { networkId: 'profile_test_1', paymentMethodTypes: ['card', 'link'] },
  };

  // ---- JCS: the request bytes are deterministic, or the binding is not ----
  check('canonical JSON sorts keys at every depth and drops whitespace',
    M.canonicalize({ b: 1, a: { d: [1, 'x'], c: null } }) === '{"a":{"c":null,"d":[1,"x"]},"b":1}', M.canonicalize({ b: 1, a: { d: [1, 'x'], c: null } }));
  check('key order in the source object does not change the wire request',
    M.encodeRequest({ z: '1', a: '2' }) === M.encodeRequest({ a: '2', z: '1' }));
  check('the request is base64url with NO padding', !/[=+/]/.test(M.encodeRequest(request)));
  check('the request round-trips', JSON.stringify(M.decodeRequest(M.encodeRequest(request))) === JSON.stringify({
    amount: '500', currency: 'usd', description: 'GifOS charge: paytest / pro',
    externalId: '{"a":"paytest","s":"pro","u":"5000000"}',
    methodDetails: { networkId: 'profile_test_1', paymentMethodTypes: ['card', 'link'] },
  }));

  // ---- the HMAC binding, exactly the spec's seven slots ----------------------
  const now = Date.parse('2026-08-28T12:00:00Z');
  const ch = await M.challenge({ secret: SECRET, realm: REALM, request, description: 'Unlock pro', now });
  const expectedInput = [REALM, 'stripe', 'charge', M.encodeRequest(request), '2026-08-28T12:10:00.000Z', '', ''].join('|');
  const key = await webcrypto.subtle.importKey('raw', Buffer.from(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expectedId = Buffer.from(await webcrypto.subtle.sign('HMAC', key, Buffer.from(expectedInput))).toString('base64url');
  check('the challenge id IS base64url(HMAC-SHA256(secret, realm|method|intent|request|expires|digest|opaque))', ch.id === expectedId, ch.id);
  check('the challenge expires ten minutes out — Link\'s own approval window', ch.expires === '2026-08-28T12:10:00.000Z');

  // ---- serialization: the WWW-Authenticate header a wallet parses ------------
  const wire = M.serializeChallenge(ch);
  check('the header starts with the Payment scheme and names method="stripe", intent="charge"',
    /^Payment id="[A-Za-z0-9_-]+", realm="pay\.gifos\.app", method="stripe", intent="charge", request="[A-Za-z0-9_-]+", description="Unlock pro", expires="2026-08-28T12:10:00\.000Z"$/.test(wire), wire);
  const quoted = M.serializeChallenge(Object.assign({}, ch, { description: 'Plan "Pro", back\\slash' }));
  check('quotes and backslashes in a description are escaped, not injected', /description="Plan \\"Pro\\", back\\\\slash"/.test(quoted), quoted);
  check('a line break in a parameter is refused outright', (() => { try { M.serializeChallenge(Object.assign({}, ch, { description: 'a\r\nWWW-Authenticate: x' })); return false; } catch (e) { return /line break/.test(e.message); } })());

  // ---- the credential: what the wallet sends back ----------------------------
  const cred = M.serializeCredential(ch, { spt: 'spt_test_1' });
  check('a credential is "Payment " + base64url JSON', /^Payment [A-Za-z0-9_-]+$/.test(cred));
  const parsed = M.parseCredential(cred);
  check('it parses back to the echoed challenge and the payload', parsed.challenge.id === ch.id && parsed.payload.spt === 'spt_test_1');
  const req = await M.verifyCredential(parsed, { secret: SECRET, realm: REALM, now: now + 1000 });
  check('an honest echo verifies and yields the bound request — amount, externalId, networkId intact',
    req.amount === '500' && req.externalId === request.externalId && req.methodDetails.networkId === 'profile_test_1');

  // ---- the refusals -------------------------------------------------------------
  const tampered = (over) => M.parseCredential(M.serializeCredential(Object.assign({}, ch, over), { spt: 'spt_test_1' }));
  check('an EDITED amount fails the binding (invalid-challenge)',
    await rejects(M.verifyCredential(tampered({ request: M.encodeRequest(Object.assign({}, request, { amount: '1' })) }), { secret: SECRET, realm: REALM, now }), /^invalid-challenge/));
  check('an EDITED expiry fails the binding — you cannot extend your own window',
    await rejects(M.verifyCredential(tampered({ expires: '2030-01-01T00:00:00.000Z' }), { secret: SECRET, realm: REALM, now }), /^invalid-challenge/));
  check('a FORGED id fails, constant-time',
    await rejects(M.verifyCredential(tampered({ id: ch.id.slice(0, -1) + (ch.id.endsWith('A') ? 'B' : 'A') }), { secret: SECRET, realm: REALM, now }), /^invalid-challenge/));
  check('another server\'s challenge (other realm) is refused even with a matching secret',
    await rejects(M.verifyCredential(tampered({ realm: 'evil.example' }), { secret: SECRET, realm: REALM, now }), /^invalid-challenge: .*another realm/));
  check('a challenge issued under another SECRET is refused',
    await rejects(M.verifyCredential(parsed, { secret: 'other', realm: REALM, now }), /^invalid-challenge/));
  check('a STALE challenge is payment-expired, checked AFTER the binding',
    await rejects(M.verifyCredential(parsed, { secret: SECRET, realm: REALM, now: now + M.CHALLENGE_TTL_MS + 1 }), /^payment-expired/));
  check('a non-stripe method is refused', await rejects(M.verifyCredential(tampered({ method: 'tempo' }), { secret: SECRET, realm: REALM, now }), /^invalid-challenge: .*stripe\/charge/));
  check('a session intent is refused', await rejects(M.verifyCredential(tampered({ intent: 'session' }), { secret: SECRET, realm: REALM, now }), /^invalid-challenge/));

  const malformed = (h) => { try { M.parseCredential(h); return false; } catch (e) { return e.type === 'malformed-credential'; } };
  check('Bearer is not Payment (malformed-credential)', malformed('Bearer abc'));
  check('padding / non-base64url bytes are malformed', malformed('Payment abc=='));
  check('base64url that is not JSON is malformed', malformed('Payment ' + Buffer.from('nope').toString('base64url')));
  check('JSON with no challenge is malformed', malformed('Payment ' + Buffer.from('{"payload":{"spt":"x"}}').toString('base64url')));
  check('JSON with no payload is malformed', malformed('Payment ' + Buffer.from(JSON.stringify({ challenge: ch })).toString('base64url')));
  check('an empty header is malformed', malformed(''));

  // ---- the receipt header ---------------------------------------------------------
  const rh = JSON.parse(Buffer.from(M.receiptHeader({ reference: 'pi_1', externalId: 'x', now }), 'base64url').toString());
  check('Payment-Receipt is base64url {method, reference, status:"success", timestamp, externalId}',
    rh.method === 'stripe' && rh.reference === 'pi_1' && rh.status === 'success' && rh.timestamp === '2026-08-28T12:00:00.000Z' && rh.externalId === 'x', JSON.stringify(rh));

  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e); process.exit(1); });
