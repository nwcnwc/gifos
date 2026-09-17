// The CORS proxy follows redirects BY HAND, one checked hop at a time — and
// never re-sends a request that carries a credential.
//
// fetch()'s own following sent the request, x-api-key and all, to wherever
// the upstream pointed, and only then checked the landing host: an open
// redirect on an allow-listed host had already carried the key off it. This
// holds the Worker to: credentialed + 3xx = refused, nothing re-sent; plain
// + 3xx = each Location checked (https, allow-listed) BEFORE it is fetched;
// off-list = refused before the fetch; 303 turns POST into GET without body.
const path = require('path');
let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }

(async () => {
  const mod = await import(path.join(__dirname, '..', '..', 'cors-proxy', 'src', 'cors-proxy.js'));
  const worker = mod.default;
  const calls = [];
  // The upstream, scripted per test: url -> response factory.
  let script = {};
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, hasBody: init.body != null, auth: init.headers.get('authorization'), key: init.headers.get('x-api-key'), redirect: init.redirect });
    const f = script[String(url)];
    if (!f) return new Response('nope', { status: 404 });
    return f(init);
  };
  const ORIGIN = 'https://gifos.app';
  const req = (target, headers, method, body) => new Request('https://cors-proxy.gifos.app/', {
    method: method || 'GET', body,
    headers: Object.assign({ Origin: ORIGIN, 'x-gifos-target': target, 'CF-Connecting-IP': '203.0.113.7' }, body ? { 'Content-Length': String(body.length) } : {}, headers || {}),
  });
  const ALLOWED = 'https://ollama.com', OTHER = 'https://text.recoveryversion.bible', EVIL = 'https://evil.example';

  // ---- credentialed request meets an open redirect: refused, never re-sent
  calls.length = 0;
  script = { [ALLOWED + '/api/x']: () => new Response(null, { status: 302, headers: { location: EVIL + '/steal' } }) };
  let r = await worker.fetch(req(ALLOWED + '/api/x', { 'x-api-key': 'k-secret' }));
  check('a credentialed request that is redirected is refused', r.status === 502, String(r.status));
  check('…and the redirect target was never fetched (the key stayed home)', calls.length === 1 && !calls.some((c) => c.url.startsWith(EVIL)), JSON.stringify(calls.map((c) => c.url)));
  check('…the first hop itself was sent with redirect: manual', calls[0].redirect === 'manual');
  calls.length = 0;
  script = { [ALLOWED + '/api/y']: () => new Response(null, { status: 302, headers: { location: OTHER + '/also-allowed' } }) };
  r = await worker.fetch(req(ALLOWED + '/api/y', { Authorization: 'Bearer t' }));
  check('…even when the redirect stays ON the allow-list (a credential never crosses a hop)', r.status === 502 && calls.length === 1, r.status + ' ' + calls.length);

  // ---- plain request, redirect off the allow-list: refused BEFORE fetching it
  calls.length = 0;
  script = { [ALLOWED + '/r']: () => new Response(null, { status: 301, headers: { location: EVIL + '/' } }) };
  r = await worker.fetch(req(ALLOWED + '/r'));
  check('a plain request redirected off the allow-list is refused', r.status === 502, String(r.status));
  check('…without fetching the off-list host', !calls.some((c) => c.url.startsWith(EVIL)), JSON.stringify(calls.map((c) => c.url)));

  // ---- plain request, allow-listed redirect: followed, one hop at a time
  calls.length = 0;
  script = {
    [ALLOWED + '/dir']: () => new Response(null, { status: 301, headers: { location: '/dir/' } }),
    [ALLOWED + '/dir/']: () => new Response('index', { status: 200, headers: { 'content-type': 'text/plain' } }),
  };
  r = await worker.fetch(req(ALLOWED + '/dir'));
  check('a plain directory redirect on an allow-listed host is followed', r.status === 200 && (await r.text()) === 'index', String(r.status));
  check('…and the final URL is reported', r.headers.get('x-gifos-final-url') === ALLOWED + '/dir/', r.headers.get('x-gifos-final-url'));
  check('…each hop sent with redirect: manual', calls.every((c) => c.redirect === 'manual'));

  // ---- 303 after POST becomes a bodiless GET
  calls.length = 0;
  script = {
    [ALLOWED + '/post']: () => new Response(null, { status: 303, headers: { location: ALLOWED + '/result' } }),
    [ALLOWED + '/result']: () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
  };
  r = await worker.fetch(req(ALLOWED + '/post', { 'Content-Type': 'application/json' }, 'POST', '{"a":1}'));
  check('303 after POST is followed as GET without the body', r.status === 200 && calls[1] && calls[1].method === 'GET' && !calls[1].hasBody, JSON.stringify(calls.map((c) => c.method + (c.hasBody ? '+body' : ''))));

  // ---- a redirect loop stops
  calls.length = 0;
  script = { [ALLOWED + '/loop']: () => new Response(null, { status: 302, headers: { location: ALLOWED + '/loop' } }) };
  r = await worker.fetch(req(ALLOWED + '/loop'));
  check('a redirect loop is cut off', r.status === 502 && calls.length <= 7, r.status + ' after ' + calls.length + ' hops');

  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
