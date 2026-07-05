/*
 * gifos mirror — serves the GifOS site on every NUMERIC subdomain.
 *
 * 7.gifos.app, 42.gifos.app, 2026.gifos.app … each numbered hostname is a
 * distinct browser origin, and IndexedDB is per-origin — so every number is
 * automatically a separate, fully isolated GifOS computer in the same browser.
 *
 * GitHub Pages can only serve one hostname (gifos.app), so this Worker
 * transparently fetches the same assets from the canonical origin and
 * re-serves them under the numbered hostname. It holds no state and adds
 * no logic beyond the hostname check.
 *
 * Non-numeric subdomains redirect to the main computer. relay.gifos.app is
 * unaffected: its own custom-domain route is more specific than the
 * *.gifos.app wildcard, so Cloudflare routes it to the relay Worker first.
 */

const ORIGIN = 'https://gifos.app';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const sub = url.hostname.endsWith('.gifos.app')
      ? url.hostname.slice(0, -'.gifos.app'.length)
      : null;

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
