/*
 * gifos mirror — serves the GifOS site on the theme subdomains.
 *
 * Each subdomain hostname is a distinct browser origin, and IndexedDB is
 * per-origin — so every one is automatically a separate, fully isolated GifOS
 * computer in the same browser. The Worker's routes in wrangler.toml are an
 * EXPLICIT ALLOW-LIST (0.gifos.app … 9.gifos.app today; add named ones as
 * themes ship) — deliberately NOT a wildcard, so traffic to any un-listed
 * subdomain never reaches (or bills) this Worker, and nobody can conjure
 * infinite computers. Adding a computer = a themes/<label>/ folder on the site
 * (see site/js/gifos-themes.js) + one route here + `wrangler deploy`.
 *
 * GitHub Pages can only serve one hostname (gifos.app), so this Worker
 * transparently fetches the same assets from the canonical origin and
 * re-serves them under the subdomain. It holds no state and adds no logic
 * beyond the hostname check — the site itself picks the theme from the label.
 *
 * relay.gifos.app is kept out of our hands by that Worker's own explicit zone
 * route (Cloudflare ROUTES BEAT CUSTOM DOMAINS); if it ever lands here it means
 * that route is missing, so we fail loudly rather than 301.
 */

const ORIGIN = 'https://gifos.app';

// Best-effort per-IP burst damper (per-isolate memory; the real global cap is a
// Cloudflare Rate-Limiting rule on the theme subdomains — see repo README). A
// real page load is dozens of asset requests, so the ceiling is generous.
const REQ_PER_MIN_PER_IP = 600;
const ipHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const log = (ipHits.get(ip) || []).filter((t) => now - t < 60000);
  log.push(now);
  ipHits.set(ip, log);
  if (ipHits.size > 10000) ipHits.clear();
  return log.length > REQ_PER_MIN_PER_IP;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const sub = url.hostname.endsWith('.gifos.app')
      ? url.hostname.slice(0, -'.gifos.app'.length)
      : null;

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip)) return new Response('rate limited', { status: 429 });

    // If relay traffic lands here, the relay Worker's route is missing and
    // the wildcard swallowed it. Fail LOUDLY — a silent 301 turns into a
    // mystery "relay connection failed" on someone's phone.
    if (sub === 'relay') {
      return new Response(
        'gifos-mirror intercepted relay.gifos.app — the relay Worker\'s route is missing.\n' +
        'Fix: cd relay && npx wrangler deploy   (see mirror/README.md)\n',
        { status: 530, headers: { 'content-type': 'text/plain' } });
    }

    // The routes in wrangler.toml already gate WHICH subdomains reach us (the
    // allow-list); here we only sanity-check the label shape and proxy. A label
    // with a dot (nested subdomain) or odd characters never has a route anyway,
    // so it falls through to the main computer.
    if (!sub || !/^[a-z0-9-]{1,32}$/.test(sub)) {
      return Response.redirect(ORIGIN + url.pathname + url.search, 301);
    }

    // GET/HEAD assets are cacheable at Cloudflare's edge, keyed on the canonical
    // gifos.app URL (host stripped) — so a flood on any theme subdomain, or the
    // same asset across several subdomains, collapses to one upstream Pages
    // fetch for the TTL. Short TTL so a push goes live within the minute.
    const ro = request.method === 'GET' || request.method === 'HEAD';
    const resp = await fetch(ORIGIN + url.pathname + url.search, {
      method: request.method,
      headers: request.headers,
      body: ro ? undefined : request.body,
      redirect: 'follow',
      cf: ro ? { cacheEverything: true, cacheTtl: 60 } : undefined,
    });
    const out = new Response(resp.body, resp);
    out.headers.set('x-gifos-computer', sub);

    // Per-theme link previews. A meeting invite made on this computer is a
    // <sub>.gifos.app URL (meet.html builds it from location.origin), so the
    // subdomain — and thus the theme — travels with the link. A messaging-app
    // scraper runs no JS, so we swap the static card for this computer's themed
    // one (site/themes/<sub>/meet-og.png) right here at the edge.
    //
    //   /meet.html            → meet.html (has the base card) — rewrite the image
    //   /meet/… , /call/…     → the pretty invite, served by 404.html (200) with
    //                           the neutral "Join on GifOS" card — rewrite it to
    //                           the themed MEETING card AND flip 404→200 so strict
    //                           scrapers (which skip non-200) still unfurl it.
    //   /join/… , everything  → left as the neutral card (404.html can't tell a
    //                           meeting from an app session; those aren't meetings).
    //
    // Every routed subdomain ships a themes/<sub>/meet-og.png (see wrangler.toml
    // "TO ADD A COMPUTER") so the themed URL never 404s.
    const isHtml = (out.headers.get('content-type') || '').includes('text/html');
    const p = url.pathname;
    const meetHtml = /^\/meet\.html$/i.test(p);
    const meetPretty = /^\/(?:meet|call)(?:\/|$)/i.test(p);
    if (ro && isHtml && (meetHtml || meetPretty)) {
      const card = ORIGIN + '/themes/' + sub + '/meet-og.png';
      const desc = 'Peer-to-peer video, right in your browser. One link — no account, no installs.';
      const title = 'Join the meeting on GifOS';
      const set = (v) => ({ element(el) { el.setAttribute('content', v); } });
      const rewritten = new HTMLRewriter()
        .on('meta[property="og:image"]', set(card))
        .on('meta[name="twitter:image"]', set(card))
        .on('meta[property="og:title"]', set(title))
        .on('meta[name="twitter:title"]', set(title))
        .on('meta[property="og:description"]', set(desc))
        .on('meta[name="twitter:description"]', set(desc))
        .on('meta[property="og:image:alt"]', set(title + ' — one link, no account, no installs.'))
        .transform(out);
      // The pretty invite came back as 404.html (status 404). Re-serve it as 200
      // so scrapers accept the unfurl; the client-side router still redirects
      // real visitors to the right page regardless of status.
      if (meetPretty) return new Response(rewritten.body, { status: 200, statusText: 'OK', headers: rewritten.headers });
      return rewritten;
    }
    return out;
  },
};
