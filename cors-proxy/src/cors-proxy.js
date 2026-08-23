// cors-proxy.gifos.app — a stateless CORS-forwarding relay for the gifos.api
// broker and gifos.fetch({proxy:true}). Some APIs (brokerages, Ollama Cloud,
// public-data sites) only serve server-to-server and send NO
// Access-Control-Allow-* headers, so a GifOS app's direct browser fetch fails
// the CORS preflight. When a request is routed through the proxy, the runtime
// sends it here with the real destination in `x-gifos-target`; this Worker
// forwards it and adds the CORS headers the browser needs. (Deepgram used to
// be the flagship case; it is served NATIVELY over WebSocket now — see
// ALLOW_HOSTS below.)
//
// It stores NOTHING — the user's key rides through in the request headers and
// is never logged or retained. Two guardrails keep it from becoming an open
// proxy (which would be an abuse + cost magnet):
//
//   1. ORIGIN GATE — only requests from a gifos.app origin are served. A browser
//      can't forge its Origin, and anyone scripting a non-browser client has no
//      reason to use a CORS proxy at all (they can hit the API directly), so
//      this genuinely confines traffic to real GifOS apps.
//   2. HOST ALLOW-LIST — it will only forward to a curated set of known API
//      hosts. Anything else is refused with a pointer to the self-host option
//      (Settings → Third-party APIs → your own proxy URL), which runs this same
//      one file on the user's OWN Cloudflare account.
//
// Cost note: Cloudflare Workers bill by REQUEST COUNT + CPU-ms, NOT bandwidth
// (Cloudflare never charges egress). Piping bytes through is I/O-bound — a few
// ms of CPU per call regardless of payload — so even heavy use costs pennies,
// or nothing on the free plan's 100k requests/day. The metered cost of the
// actual API (e.g. Deepgram minutes) is billed to the user's own key.

// Hosts this shared proxy will forward to. Add a line + redeploy to support a
// new server-only API. (A self-hosted copy can widen or replace this list.)
//
// api.deepgram.com is GONE from this list (2026-08-23): GifOS speaks
// Deepgram's WebSocket API natively (runtime.js deepgramListenWS) — a WS
// handshake has no CORS preflight and the key rides the subprotocol straight
// to Deepgram — so the user's key and audio no longer transit this proxy at
// all. Prefer that shape for any future keyed API that offers a WS door.
//
// The long-term aim (docs/roadmap.md → "shared CORS proxy: keyed-traffic
// refusal") is for this shared proxy to carry only KEYLESS public-data hosts;
// keyed CORS-hostile APIs should go native (like Deepgram) or self-hosted.
const ALLOW_HOSTS = new Set([
  // Public Bible text for the default "Bible Browser" app. Sends no CORS
  // headers, so the app reads it through this proxy (gifos.fetch{proxy:true}).
  // Keyless — exactly the traffic this shared proxy should carry forever.
  'text.recoveryversion.bible',
  // Ollama Cloud (OpenAI-compatible at https://ollama.com/v1) for the "Smartest
  // text LLM" provider. Keyed AND server-only — verified 2026-08-23 that
  // neither its preflight nor its responses carry any Access-Control-Allow-*
  // header, and it has no WS door — so it needs this proxy for now. It is the
  // one keyed host left; it leaves the list when it grows CORS or a native
  // path, or when keyed-traffic refusal ships (roadmap).
  'ollama.com',
]);

// Abuse/cost guards. Cloudflare bills request-count + CPU-ms (never bandwidth),
// so the two ways this Worker costs money are: (a) request floods, and (b)
// buffering giant bodies. Cap both.
const MAX_BODY_BYTES = 25 * 1024 * 1024;  // 25 MB — real request bodies here are KBs of JSON
const REQ_PER_MIN_PER_IP = 240;           // generous for a chatty app; hostile to loops
// Best-effort per-IP limiter: per-isolate memory, so it's a burst damper at
// each edge PoP, not a global ledger. The real global cap is a Cloudflare
// dashboard Rate-Limiting rule on cors-proxy.gifos.app (see repo README).
const ipHits = new Map(); // ip -> [timestamps]
function rateLimited(ip) {
  const now = Date.now();
  const log = (ipHits.get(ip) || []).filter((t) => now - t < 60000);
  log.push(now);
  ipHits.set(ip, log);
  if (ipHits.size > 10000) ipHits.clear(); // cap memory; best-effort anyway
  return log.length > REQ_PER_MIN_PER_IP;
}

// Requests are only served for these origins. Empty Origin (same-origin / curl)
// is refused — a real GifOS app always sends one.
function originAllowed(origin) {
  if (!origin) return false;
  let h;
  try { h = new URL(origin).hostname; } catch (e) { return false; }
  return h === 'gifos.app' || h.endsWith('.gifos.app') || h === 'localhost' || h === '127.0.0.1';
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': '*',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function fail(status, msg, origin) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors(origin)),
  });
}

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';

    if (req.method === 'OPTIONS') {
      // Preflight — always answer so the browser will send the real request;
      // the Origin gate is enforced on that real request below.
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (!originAllowed(origin)) {
      return fail(403, 'cors-proxy.gifos.app only serves GifOS apps (gifos.app origins).', origin);
    }

    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip)) return fail(429, 'Too many requests — slow down.', origin);

    // Reject oversized bodies before buffering them into isolate memory.
    const clen = parseInt(req.headers.get('Content-Length') || '0', 10);
    if (clen > MAX_BODY_BYTES) return fail(413, 'Body too large for the shared proxy.', origin);

    const target = req.headers.get('x-gifos-target') || '';
    let u;
    try { u = new URL(target); } catch (e) { return fail(400, 'Missing or invalid x-gifos-target header.', origin); }
    if (u.protocol !== 'https:') return fail(400, 'x-gifos-target must be https.', origin);
    if (!ALLOW_HOSTS.has(u.hostname)) {
      return fail(403, 'cors-proxy.gifos.app does not forward to ' + u.hostname +
        '. Run your own proxy for it (Settings → Third-party APIs → set a custom proxy URL); the one-file Worker is in cors-proxy/ in the repo.', origin);
    }

    // Rebuild the outbound headers: drop hop-by-hop + our control header, keep
    // Authorization / Content-Type / everything the API needs.
    const fwd = new Headers(req.headers);
    fwd.delete('x-gifos-target');
    fwd.delete('host');
    fwd.delete('origin');
    fwd.delete('referer');

    const method = req.method;
    const hasBody = method !== 'GET' && method !== 'HEAD';
    // Buffer the body (audio clips are small — seconds of speech is a few
    // hundred KB, well under the isolate's memory limit). Avoids request-stream
    // duplex quirks and keeps the forward simple.
    const body = hasBody ? await req.arrayBuffer() : undefined;

    // GETs to the allow-listed public hosts are cacheable at Cloudflare's edge,
    // KEYED ON THE TARGET URL (the subrequest url), not the shared proxy url —
    // so a flood of identical Bible-text reads collapses to one upstream fetch
    // and near-zero CPU. Never cache authenticated calls (they carry per-user
    // headers and go through as-is).
    const cacheable = !hasBody && (method === 'GET' || method === 'HEAD') && !req.headers.get('authorization');
    const init = { method, headers: fwd, body };
    if (cacheable) init.cf = { cacheEverything: true, cacheTtl: 3600 };

    let resp;
    try {
      resp = await fetch(u.toString(), init);
    } catch (e) {
      return fail(502, 'Upstream request failed: ' + (e && e.message || e), origin);
    }

    const out = new Headers(resp.headers);
    const c = cors(origin);
    for (const k in c) out.set(k, c[k]);
    // Every request reaches this Worker at the SAME URL (the proxy origin), with
    // the real destination in x-gifos-target. If the upstream response is
    // cacheable (e.g. it carries only Last-Modified), a browser keying its cache
    // on URL would replay one target's body for a different target. Forbid
    // caching so distinct targets never collide, whatever the upstream sent.
    out.set('Cache-Control', 'no-store');
    // Tell the caller where the request actually landed. fetch() follows redirects
    // server-side (e.g. a directory "…/x" -> "…/x/"), and the browser can't see
    // that through the proxy — so an app resolving relative links would use the
    // pre-redirect URL and point them at the wrong directory. resp.url is the
    // final upstream URL; Access-Control-Expose-Headers:* makes it readable.
    out.set('x-gifos-final-url', resp.url);
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: out });
  },
};
