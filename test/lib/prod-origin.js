/*
 * prod-origin.js — run a page whose ORIGIN REALLY IS `https://gifos.app`,
 * served by the ordinary local site server.
 *
 * WHY THIS EXISTS (measured, 2026-08-16, release gate for 0.9.9).
 *
 * Two suites — e2e-meet-prettyurl and e2e-join-prettyurl — exist to guard the
 * pretty address bar, and the branch they guard is gated on the HOSTNAME:
 *
 *     const pretty = /(^|\.)gifos\.app$/.test(location.hostname) && !custom;
 *
 * so they faked production the obvious way: `--host-resolver-rules=MAP
 * gifos.app 127.0.0.1` and a plain `http://gifos.app:8099/run.html`. That
 * stopped loading anything at all under Playwright 1.62 / chromium-1234
 * (Chrome 151), which is what the gate box now resolves:
 *
 *     page.goto: net::ERR_SSL_PROTOCOL_ERROR at http://gifos.app:8099/run.html
 *
 * `.app` is an HSTS-PRELOADED TLD — the whole gTLD is force-https in Chrome's
 * built-in list — so the browser rewrote the navigation to https:// before it
 * ever hit the wire, met python's plain-HTTP server there, and failed the
 * handshake. Both suites died on their FIRST goto, exiting non-zero having
 * asserted NOTHING: the DEAD state CLAUDE.md calls the most dangerous result
 * there is. Measured on chromium-1228 the same URL still loaded, which is why
 * this arrived as "it broke on its own" — the browser got stricter, the
 * premise (that gifos.app can be spoken to over http) was always false, and it
 * is not something a flag can turn off: `--disable-features=HttpsUpgrades,…`
 * changes nothing, and `--unsafely-treat-insecure-origin-as-secure` is about
 * secure-context privileges, not about the scheme upgrade.
 *
 * THE FIX IS TO STOP FAKING THE SCHEME. Production is https; so is this. The
 * context serves every `https://gifos.app/...` request out of the local site
 * server by fulfilling it from node, so:
 *   - the renderer's origin is literally `https://gifos.app` — the hostname
 *     branch under test is taken for the real reason, not a patched flag;
 *   - it is a genuinely secure context, so `crypto.subtle` is there (the old
 *     http fake had none, which is why the run.html preflight started stopping
 *     that page — see the note both suites used to carry);
 *   - no certificate, no second port, and no bytes leave the machine.
 *
 * Nothing about the page under test is rewritten: this ships the SAME bytes the
 * site server would, under a different scheme and host. Route interception does
 * not reach a Service Worker's own fetches, and an https origin is the first
 * one the site's worker will actually install on — so create the context with
 * `serviceWorkers: 'block'`, or half the page comes back from a worker cache
 * this route never sees.
 *
 *   const { PROD_ARGS, PROD_ORIGIN, serveProdOrigin } = require('../lib/prod-origin');
 *   const browser = await chromium.launch({ executablePath: CHROME, args: [...PROD_ARGS] });
 *   const ctx = await browser.newContext({ serviceWorkers: 'block' });
 *   const base = await serveProdOrigin(ctx, { port: 8099 });   // 'https://gifos.app'
 */
const http = require('http');

const PROD_HOST = 'gifos.app';
const PROD_ORIGIN = 'https://' + PROD_HOST;

/*
 * Belt and braces, NOT the mechanism: every gifos.app request is fulfilled
 * locally, so nothing here should ever reach the resolver. The rule is what
 * makes that a guarantee rather than a hope — anything that slips past the
 * route (a Service Worker, a subresource on a host we did not pattern) lands on
 * 127.0.0.1 and fails loudly instead of touching the PRODUCTION relay or site.
 * The wildcard covers relay.gifos.app: these suites deliberately keep the
 * DEFAULT relay (a custom one turns the pretty branch off), so the page really
 * does dial wss://relay.gifos.app and must not be allowed to arrive.
 */
const PROD_ARGS = ['--host-resolver-rules=MAP *gifos.app 127.0.0.1'];

function fetchLocal(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path,
      // identity: we forward the bytes verbatim, so never invite an encoding
      // we would have to undo before handing them back to the browser.
      headers: { 'accept-encoding': 'identity' } }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(body || undefined);
  });
}

/*
 * serveProdOrigin(ctx, { port }) — install the route, and hand back the base
 * URL to drive ('https://gifos.app'). Await it BEFORE the first goto.
 *
 * Refuses (throws) when the site server is not up, rather than letting the
 * suite fail its first navigation with net::ERR_FAILED and read as a product
 * red — same doctrine as test/lib/need.js, one layer in.
 */
async function serveProdOrigin(ctx, opts) {
  const port = (opts && opts.port) || 8099;
  const host = (opts && opts.host) || PROD_HOST;
  const origin = 'https://' + host;
  let probe;
  try { probe = await fetchLocal(port, 'GET', '/run.html'); } catch (e) {
    throw new Error('prod-origin: nothing is serving the site on 127.0.0.1:' + port
      + ' (' + e.message + ') — start it:  python3 -m http.server ' + port + ' -d site');
  }
  if (probe.status !== 200) {
    throw new Error('prod-origin: 127.0.0.1:' + port + '/run.html answered ' + probe.status
      + ' — that is not the GifOS site server; start  python3 -m http.server ' + port + ' -d site');
  }
  await ctx.route(origin + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    try {
      const r = await fetchLocal(port, req.method(), u.pathname + u.search, req.postData());
      // Drop hop-by-hop framing: we are handing back a body, and a stale
      // transfer-encoding/content-length would describe the upstream's framing
      // rather than ours.
      const headers = { ...r.headers };
      delete headers['transfer-encoding'];
      delete headers['content-length'];
      delete headers['content-encoding'];
      await route.fulfill({ status: r.status, headers, body: r.body });
    } catch (e) {
      // An abort here is visible as a failed subresource, never as silence.
      console.log('  [prod-origin] upstream failed for ' + u.pathname + ' — ' + e.message);
      await route.abort();
    }
  });
  return origin;
}

module.exports = { PROD_HOST, PROD_ORIGIN, PROD_ARGS, serveProdOrigin };
