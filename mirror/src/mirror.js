/*
 * gifos mirror — serves the GifOS site on the ten single-digit subdomains.
 *
 * 0.gifos.app … 9.gifos.app: each numbered hostname is a distinct browser
 * origin, and IndexedDB is per-origin — so every digit is automatically a
 * separate, fully isolated GifOS computer in the same browser. The Worker's
 * routes enumerate exactly these ten (see wrangler.toml), so traffic to any
 * other subdomain never reaches (or bills) this Worker.
 *
 * GitHub Pages can only serve one hostname (gifos.app), so this Worker
 * transparently fetches the same assets from the canonical origin and
 * re-serves them under the numbered hostname. It holds no state and adds
 * no logic beyond the hostname check.
 *
 * Non-numeric subdomains redirect to the main computer. relay.gifos.app is
 * kept out of our hands by the relay Worker's own explicit zone route —
 * Cloudflare ROUTES BEAT CUSTOM DOMAINS, and route-vs-route the relay's
 * non-wildcard pattern outranks our wildcard (see relay/wrangler.toml).
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

    if (!sub || !/^\d+$/.test(sub)) {
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
