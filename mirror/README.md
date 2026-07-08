# gifos-mirror

Serves the GifOS site on **the theme subdomains** — `0.gifos.app` through
`9.gifos.app` today, plus any named computers added later. The routes in
`wrangler.toml` are an **explicit allow-list** (never a `*.gifos.app` wildcard),
so an un-listed subdomain never invokes or bills this Worker and nobody can
spin up infinite computers. Each hostname is a distinct browser origin with its
own IndexedDB, so **every one is a separate, fully isolated GifOS computer** in
the same browser. No accounts, no server state — origin isolation does all the work.

GitHub Pages only serves one hostname (`gifos.app`), so this stateless Worker
fetches the same assets from the canonical origin and re-serves them under the
subdomain; the site picks the theme from the subdomain label. Anything that
somehow reaches the Worker without a matching route 301-redirects to `gifos.app`.

## Adding a computer

1. Add its theme folder to the site: `site/themes/<label>/` (see
   `site/js/gifos-themes.js`). Push — GitHub Pages redeploys.
2. Add a route block for it in `wrangler.toml` (named labels like
   `neon.gifos.app/*` are fine), then `wrangler deploy` (below).

The wildcard DNS record already covers every name, so there's no per-computer
DNS step.

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

## How relay.gifos.app stays out of the mirror's hands

**Cloudflare's precedence rule: ROUTES BEAT CUSTOM DOMAINS.** When a request
matches both a Worker route and another Worker's custom domain, the route
Worker runs — specificity only breaks ties *between routes*. So the mirror's
`*.gifos.app/*` wildcard route will happily swallow `relay.gifos.app` even
after the relay's custom domain exists (this bit us in production: every
invite died with "relay connection failed" while `wrangler deploy` looked
perfectly successful).

The fix, baked into `relay/wrangler.toml`, is that the relay binds **both**:

1. a **custom domain** `relay.gifos.app` — manages DNS + the TLS certificate;
2. an explicit **zone route** `relay.gifos.app/*` — route-vs-route, this
   non-wildcard pattern outranks the mirror's wildcard and actually wins the
   traffic.

The mirror also fails loudly as a backstop: if relay traffic ever reaches it,
it returns a 530 with the fix instructions instead of silently redirecting.

**Verify** after deploying both Workers:

```bash
curl https://relay.gifos.app/        # → "gifos relay ok"
```

or in GifOS: Settings → Advanced → **Test connection**. Note that browsers
cache the old 301 redirect aggressively — test in a private window after
fixing. If wrangler ever complains that a `relay` DNS record already exists
(a manual CNAME from early setup), delete that record in Cloudflare → DNS and
deploy again.
