# gifos-cors-proxy

A tiny **stateless CORS-forwarding relay** for the `gifos.api` capability, served
at **`cors-proxy.gifos.app`**.

## Why it exists

GifOS apps run at an opaque sandbox origin and reach keyed third-party APIs
through the runtime broker (`gifos.api`), which does a **direct browser
`fetch`**. That only works if the API returns permissive CORS headers. Many
server-only APIs — **Deepgram's REST**, most brokerages — send **none**, so the
browser blocks the call at preflight.

When the user turns on **Route through a CORS proxy** for an API (Settings →
Third-party APIs), the runtime instead sends the request to this Worker with the
real destination in an `x-gifos-target` header. The Worker forwards it upstream
and adds the CORS headers the browser needs. It **stores nothing** — the user's
key rides through in the request headers and is never logged or retained.

## What it does NOT become: an open proxy

Two guardrails keep it from being an abuse/cost magnet:

1. **Origin gate** — it only serves requests from a `gifos.app` origin. A browser
   can't forge its `Origin`, and anyone scripting a non-browser client has no
   reason to use a CORS proxy (they can hit the API directly), so this confines
   traffic to real GifOS apps.
2. **Host allow-list** — it only forwards to a curated set of API hosts
   (`ALLOW_HOSTS` in `src/cors-proxy.js`, starting with `api.deepgram.com`).
   Anything else is refused with a pointer to the self-host option below.

## What it costs the operator (spoiler: ~nothing)

**Cloudflare Workers bill by request count + CPU-time, NOT bandwidth** —
Cloudflare never charges egress. This Worker just pipes bytes, which is
I/O-bound, so it burns only a few **CPU-milliseconds per call regardless of
payload size**. Audio uploads flowing through it are free.

| Plan | Included | Overage |
|------|----------|---------|
| **Free** | 100,000 requests/day | — (hard cap, then 429s) |
| **Paid ($5/mo)** | 10,000,000 requests/mo + 30M CPU-ms | $0.30 / additional million requests |

So 10,000 transcriptions/day ≈ 300k requests/mo — comfortably inside the free
tier, and a rounding error on the paid tier. **The metered cost that actually
adds up is the API's own bill** (e.g. Deepgram per-minute ASR), which is charged
to whoever's key is used — the **end user's** Deepgram account, via their key in
their browser. Running the shared proxy does **not** put your users' Deepgram
minutes on your bill; only the (negligible) request/CPU cost of the forward hop.

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
  -H 'x-gifos-target: https://api.deepgram.com/'
# → forwards to Deepgram (401 without a key — proves the hop works)
```

## Adding a new server-only API

1. Add its host to `ALLOW_HOSTS` in `src/cors-proxy.js`.
2. `wrangler deploy`.

(Or leave it out and let users self-host for it.)
