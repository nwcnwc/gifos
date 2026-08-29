/*
 * pay/src/mpp.js — the Machine Payments Protocol wire, and nothing else.
 *
 * MPP (https://mpp.dev, draft-ryan-httpauth-payment) is how an AGENT pays an
 * HTTP endpoint: the server answers 402 with a `WWW-Authenticate: Payment …`
 * challenge, the agent's wallet turns it into a credential, the request is
 * retried with `Authorization: Payment <base64url-json>`, and a 200 carries
 * a `Payment-Receipt` header. Stripe's Link agent wallet (link.com/agents,
 * `link-cli mpp pay`) speaks exactly this with method="stripe" and a Shared
 * Payment Token in the payload — that is the buyer this file exists for.
 *
 * PURE and STATELESS, like the invoice tokens in core.js: the challenge id
 * IS an HMAC over the challenge's own fields (the spec's recommended
 * binding), so a credential proves it echoes a challenge THIS server issued
 * without a store of issued ids. Nothing here calls Stripe, signs a receipt
 * or touches money — core.js does that after this file says the credential
 * is genuine. The environment injects WebCrypto; nothing here touches it
 * directly (core.js runs unchanged in the Worker and the gate's Node twin).
 *
 * The spec's wire rules that matter, pinned here so the unit test can hold
 * them: `request` and `opaque` are JCS (RFC 8785) JSON, base64url, no
 * padding; the HMAC input is seven pipe-joined slots (realm, method, intent,
 * request, expires, digest, opaque) plus an eighth `header` slot only when
 * present; quoted-string values escape backslash and quote; a credential is
 * `Payment ` + base64url({challenge, payload}); malformed / stale / wrong
 * credentials are ALL answered 402 with a fresh challenge and an RFC 9457
 * problem body — never 401, never 400.
 */

const SCHEME = 'Payment';
const CHALLENGE_TTL_MS = 10 * 60 * 1000;   // Link gives the human 10 minutes to approve; so do we

// ---- base64url, no padding -------------------------------------------------
const b64u = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (str) => {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new Error('not base64url');
  const b = atob(String(str).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out;
};
const b64uText = (s) => b64u(new TextEncoder().encode(s));
const unb64uText = (s) => new TextDecoder().decode(unb64u(s));

// ---- JCS, RFC 8785 ---------------------------------------------------------
// The whole of what MPP needs: object keys sorted by UTF-16 code unit, no
// whitespace, JSON.stringify's string/number/bool/null encoding. (RFC 8785's
// number rules differ from JSON.stringify only for values our requests never
// carry — amounts are STRINGS on this wire, on purpose.)
function canonicalize(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
}
const encodeRequest = (obj) => b64uText(canonicalize(obj));
const decodeRequest = (s) => JSON.parse(unb64uText(s));

// ---- quoted-string auth-params ---------------------------------------------
function authParam(name, value) {
  const v = String(value);
  if (/[\r\n]/.test(v)) throw new Error('a challenge parameter cannot contain a line break');
  return name + '="' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\u0100-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '"';
}

// ---- problem details (RFC 9457) --------------------------------------------
// The four problem types the spec names for a 402. `type` is the spec's
// short token; a client that only reads `detail` still gets a sentence.
const PROBLEMS = {
  'malformed-credential': 'The Authorization credential was not a valid Payment credential',
  'invalid-challenge': 'The credential does not echo a challenge this server issued',
  'payment-expired': 'The challenge has expired — retry to get a fresh one',
  'verification-failed': 'The payment could not be verified',
};
class MppError extends Error {
  constructor(type, detail) { super(detail || PROBLEMS[type] || type); this.type = PROBLEMS[type] ? type : 'verification-failed'; }
}

export function makeMpp(env) {
  const subtle = env.subtle;

  // The stateless binding: id = base64url(HMAC-SHA256(secret, slots)).
  const keyCache = new Map();
  async function hmacKey(secret) {
    if (!keyCache.has(secret)) keyCache.set(secret, await subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
    return keyCache.get(secret);
  }
  async function bindingId(secret, c) {
    const slots = [c.realm, c.method, c.intent, c.request, c.expires || '', c.digest || '', c.opaque || ''];
    if (c.header !== undefined) slots.push(c.header);
    const mac = new Uint8Array(await subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(slots.join('|'))));
    return b64u(mac);
  }

  // Build a stripe/charge challenge. `request` is the method's request object
  // (amount in cents AS A STRING, currency, methodDetails.networkId, …); it is
  // canonicalized here so the id binds exactly the bytes that go on the wire.
  async function challenge({ secret, realm, request, description, now }) {
    const c = {
      realm,
      method: 'stripe',
      intent: 'charge',
      request: encodeRequest(request),
      expires: new Date((now || Date.now()) + CHALLENGE_TTL_MS).toISOString(),
    };
    c.id = await bindingId(secret, c);
    if (description) c.description = description;
    return c;
  }

  function serializeChallenge(c) {
    const parts = [authParam('id', c.id), authParam('realm', c.realm), authParam('method', c.method), authParam('intent', c.intent), authParam('request', c.request)];
    if (c.description !== undefined) parts.push(authParam('description', c.description));
    if (c.digest !== undefined) parts.push(authParam('digest', c.digest));
    if (c.expires !== undefined) parts.push(authParam('expires', c.expires));
    if (c.header !== undefined) parts.push(authParam('header', c.header));
    if (c.opaque !== undefined) parts.push(authParam('opaque', c.opaque));
    return SCHEME + ' ' + parts.join(', ');
  }

  // Authorization: Payment <base64url({challenge, payload, source?})>. The
  // echoed challenge's `request` stays the wire STRING — it is HMAC input,
  // and re-serializing it would be exactly the cross-implementation drift
  // the spec's JCS rule exists to prevent.
  function parseCredential(header) {
    const m = /^\s*Payment\s+([A-Za-z0-9_-]+)\s*$/i.exec(String(header || ''));
    if (!m) throw new MppError('malformed-credential', 'Authorization must be "Payment <base64url>"');
    let parsed;
    try { parsed = JSON.parse(unb64uText(m[1])); } catch (e) { throw new MppError('malformed-credential', 'Authorization credential is not base64url JSON'); }
    const c = parsed && parsed.challenge;
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || typeof c.realm !== 'string' || typeof c.method !== 'string' || typeof c.intent !== 'string' || typeof c.request !== 'string') {
      throw new MppError('malformed-credential', 'the credential echoes no complete challenge');
    }
    if (typeof c.opaque === 'object' && c.opaque !== null) c.opaque = encodeRequest(c.opaque);   // clients may echo opaque decoded; the binding used the wire form
    if (!parsed.payload || typeof parsed.payload !== 'object') throw new MppError('malformed-credential', 'the credential carries no payload');
    return { challenge: c, payload: parsed.payload, source: typeof parsed.source === 'string' ? parsed.source : undefined };
  }

  // Constant-time equality over the ids, so a forged id leaks nothing by timing.
  function same(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  // Is this credential an honest echo of a challenge WE issued, for THIS
  // realm, still live? Returns the decoded request object. Order matters and
  // is the spec's: binding and expiry BEFORE anything touches the payload.
  async function verifyCredential(cred, { secret, realm, now }) {
    const c = cred.challenge;
    if (c.method !== 'stripe' || c.intent !== 'charge') throw new MppError('invalid-challenge', 'this endpoint issues stripe/charge challenges only');
    if (c.realm !== realm) throw new MppError('invalid-challenge', 'the challenge was issued for another realm');
    if (!same(c.id, await bindingId(secret, c))) throw new MppError('invalid-challenge');
    if (!c.expires || Number.isNaN(Date.parse(c.expires))) throw new MppError('invalid-challenge', 'the challenge carries no valid expiry');
    if ((now || Date.now()) > Date.parse(c.expires)) throw new MppError('payment-expired');
    let request;
    try { request = decodeRequest(c.request); } catch (e) { throw new MppError('malformed-credential', 'the echoed request is not base64url JSON'); }
    return request;
  }

  // Payment-Receipt: base64url JSON, the spec's shape.
  function receiptHeader({ reference, externalId, now }) {
    const r = { method: 'stripe', reference: String(reference), status: 'success', timestamp: new Date(now || Date.now()).toISOString() };
    if (externalId !== undefined) r.externalId = String(externalId);
    return b64uText(JSON.stringify(r));
  }

  return {
    SCHEME, CHALLENGE_TTL_MS, PROBLEMS, MppError,
    canonicalize, encodeRequest, decodeRequest, b64u, unb64u,
    challenge, serializeChallenge, parseCredential, verifyCredential, receiptHeader,
    // for tests and clients: what a wallet sends back
    serializeCredential: (c, payload) => SCHEME + ' ' + b64uText(JSON.stringify({ challenge: c, payload })),
  };
}
