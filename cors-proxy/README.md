# gifos-cors-proxy

A tiny **stateless CORS-forwarding relay** for GifOS apps, served at
**`cors-proxy.gifos.app`**. Two callers use it: the `gifos.api` broker (keyed
third-party APIs, when the user turns the proxy on) and keyless
`gifos.fetch(url, {proxy:true})` under the `network` capability — which is the
traffic the allow-list is being narrowed toward.

## Why it exists

GifOS apps run at an opaque sandbox origin and reach keyed third-party APIs
through the runtime broker (`gifos.api`), which does a **direct browser
`fetch`**. That only works if the API returns permissive CORS headers. Some
hosts — most brokerages, some content sites — send **none**, so the browser
blocks the call at preflight. (Deepgram used to be the flagship case; it no
longer is — the broker now speaks Deepgram's WebSocket API natively, so
neither the key nor the audio ever touches this Worker.)

When the user turns on **Route through a CORS proxy** for an API (Settings →
Third-party APIs), the runtime instead sends the request to this Worker with the
real destination in an `x-gifos-target` header. The Worker forwards it upstream
and adds the CORS headers the browser needs. It **stores nothing** — the user's
key rides through in the request headers and is never logged or retained.

## What it does NOT become: an open proxy

Two guardrails keep it from being an abuse/cost magnet:

1. **Origin gate** — it only serves requests from a `gifos.app` origin (plus
   `localhost`/`127.0.0.1` for development). A browser
   can't forge its `Origin`, and anyone scripting a non-browser client has no
   reason to use a CORS proxy (they can hit the API directly), so this confines
   traffic to real GifOS apps.
2. **Host allow-list** — it only forwards to a curated set of hosts
   (`ALLOW_HOSTS` in `src/cors-proxy.js` — today `text.recoveryversion.bible`
   and `ollama.com`; `api.deepgram.com` was removed when Deepgram went
   native). Anything else is refused with a pointer to the self-host option
   below. (Two more backstops in the code: a per-IP rate limit and a request
   body cap.)

## What it costs the operator (spoiler: ~nothing)

**Cloudflare Workers bill by request count + CPU-time, NOT bandwidth** —
Cloudflare never charges egress. This Worker just pipes bytes, which is
I/O-bound, so it burns only a few **CPU-milliseconds per call regardless of
payload size**.

| Plan | Included | Overage |
|------|----------|---------|
| **Free** | 100,000 requests/day | — (hard cap, then 429s) |
| **Paid ($5/mo)** | 10,000,000 requests/mo + 30M CPU-ms | $0.30 / additional million requests |

Real traffic today (Bible text for the Bible Browser, Ollama Cloud requests)
sits comfortably inside the free tier, and is a rounding error on the paid
tier. **The metered cost that actually adds up is the API's own bill**, which
is charged to whoever's key is used — the end user's account, via their key in
their browser. Running the shared proxy does **not** put your users' API usage
on your bill; only the (negligible) request/CPU cost of the forward hop.

If GifOS ever gets big enough that the request volume matters, heavy users can
point at **their own** proxy (below), moving that hop to their Cloudflare
account.

## Self-hosting (the Advanced setting)

Any user can run their own copy and point GifOS at it — Settings →
Third-party APIs → enable the proxy and set a **custom proxy URL**. Their
traffic then runs on **their** Cloudflare account, and they can widen
`ALLOW_HOSTS` to whatever APIs they need. It's this one file:

```bash
# 1. copy cors-proxy/ somewhere and edit ALLOW_HOSTS in src/cors-proxy.js
# 2. point wrangler at your own hostname (or use *.workers.dev), then:
cd cors-proxy
wrangler deploy
# 3. in GifOS: Settings → Third-party APIs → your API → custom proxy URL =
#    https://<your-worker-host>
```

## Deploy (the official cors-proxy.gifos.app)

**1. Deploy the Worker** (from a machine with wrangler logged in):

```bash
cd cors-proxy
wrangler deploy
```

The `[[routes]]` block binds both a **custom domain** (DNS + TLS for
`cors-proxy.gifos.app`) and an explicit **zone route** (`cors-proxy.gifos.app/*`)
— routes beat custom domains in Cloudflare's precedence, so this survives any
future wildcard route on another Worker (the bug that once broke the relay).

**2. DNS** is already covered by the proxied wildcard `A *` record added for the
mirror (see `mirror/README.md`) — no per-Worker DNS step. Universal SSL already
covers `*.gifos.app`.

**Verify:**

```bash
# preflight is open; the real GET is Origin-gated and host-allow-listed
curl -i https://cors-proxy.gifos.app/ \
  -H 'Origin: https://gifos.app' \
  -H 'x-gifos-target: https://text.recoveryversion.bible/'
# → forwards upstream with CORS headers added — proves the hop works
# (a host NOT in ALLOW_HOSTS gets a 403 instead)
```

## Adding a new server-only API

1. Add its host to `ALLOW_HOSTS` in `src/cors-proxy.js`.
2. `wrangler deploy`.

(Or leave it out and let users self-host for it.)
