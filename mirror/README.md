# gifos-mirror

Serves the GifOS site on **every numeric subdomain** — `7.gifos.app`,
`42.gifos.app`, `2026.gifos.app`, any number at all. Each numbered hostname is
a distinct browser origin with its own IndexedDB, so **every number is a
separate, fully isolated GifOS computer** in the same browser. No accounts, no
server state — origin isolation does all the work.

GitHub Pages only serves one hostname (`gifos.app`), so this stateless Worker
fetches the same assets from the canonical origin and re-serves them under the
numbered hostname. Non-numeric subdomains 301-redirect to `gifos.app`.

## Deploy (two steps)

**1. Deploy the Worker** (from a machine with wrangler logged in):

```bash
cd mirror
wrangler deploy
```

**2. Add the wildcard DNS record** (one-time, Cloudflare dashboard):

Cloudflare → `gifos.app` → **DNS** → **Add record**:

| Type | Name | IPv4 address | Proxy status |
|------|------|--------------|--------------|
| A    | `*`  | `192.0.2.1`  | **Proxied (orange cloud)** — required |

The IP is a dummy (TEST-NET, never routed); it exists only so the proxied
hostname resolves to Cloudflare, where the Worker route takes over. The
**orange cloud is essential** — unlike the apex records (which stay gray so
GitHub can serve its certificate), the wildcard must be proxied for the
Worker to run. Cloudflare's free Universal SSL already covers `*.gifos.app`.

**Verify:** open `https://7.gifos.app` → the GifOS desktop, with its own
separate storage. `https://anything-else.gifos.app` → redirects to gifos.app.

## Why relay.gifos.app is unaffected

Explicit DNS records beat the `*` wildcard, and Cloudflare routes requests to
the **most specific** matching Worker route — `relay.gifos.app`'s custom
domain wins over `*.gifos.app/*`. The mirror also guards itself: a non-numeric
subdomain never proxies, it only redirects.
