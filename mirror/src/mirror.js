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
 * relay.gifos.app / mcp.gifos.app are kept out of our hands by those Workers'
 * own explicit zone routes (Cloudflare ROUTES BEAT CUSTOM DOMAINS); if one ever
 * lands here it means that route is missing, so we fail loudly rather than 301.
 */

const ORIGIN = 'https://gifos.app';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const sub = url.hostname.endsWith('.gifos.app')
      ? url.hostname.slice(0, -'.gifos.app'.length)
      : null;

    // If relay traffic lands here, the relay Worker's route is missing and
    // the wildcard swallowed it. Fail LOUDLY — a silent 301 turns into a
    // mystery "relay connection failed" on someone's phone.
    if (sub === 'relay' || sub === 'mcp') {
      return new Response(
        'gifos-mirror intercepted ' + sub + '.gifos.app — that Worker\'s route is missing.\n' +
        'Fix: cd ' + sub + ' && npx wrangler deploy   (see mirror/README.md)\n',
        { status: 530, headers: { 'content-type': 'text/plain' } });
    }

    // The routes in wrangler.toml already gate WHICH subdomains reach us (the
    // allow-list); here we only sanity-check the label shape and proxy. A label
    // with a dot (nested subdomain) or odd characters never has a route anyway,
    // so it falls through to the main computer.
    if (!sub || !/^[a-z0-9-]{1,32}$/.test(sub)) {
      return Response.redirect(ORIGIN + url.pathname + url.search, 301);
    }

    const resp = await fetch(ORIGIN + url.pathname + url.search, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'follow',
    });
    const out = new Response(resp.body, resp);
    out.headers.set('x-gifos-computer', sub);
    return out;
  },
};
