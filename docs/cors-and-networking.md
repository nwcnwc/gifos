# GifOS Networking

GifOS apps have two distinct networking needs, and this document covers both:

1. **Browser-as-server** — one browser hosts a database and others connect to it, so an app can be multiplayer/multi-user. This is the primary model, built on the stateless `gifos.app` relay. **(Part 1)**
2. **External APIs** — an app calls a third-party service (OpenAI, a weather API, a database-as-a-service). This uses a postMessage fetch bridge with a CORS-proxy fallback. **(Part 2)**

Both share one principle: **nothing of the user's lives on our infrastructure.** The relay only passes messages; API keys only ever exist on the user's device.

---

# Part 1 — Browser-as-Server: P2P with a Relay Fallback

## Transport ladder

Session traffic prefers a **direct browser-to-browser WebRTC DataChannel** and
falls back to the relay WebSocket automatically:

1. Both browsers connect to `relay.gifos.app` (they need it for signaling anyway).
2. The host offers a WebRTC connection; SDP offers/answers and ICE candidates
   are exchanged **through the relay** (it's the introduction service).
3. Each browser learns its own public address by asking a STUN server, then
   both sides fire packets at each other's candidate addresses simultaneously —
   each side's outbound packet punches the NAT hole the other side's packet
   flies through.
4. If a DataChannel opens (~80–90% of networks): all DB traffic moves onto it,
   direct and DTLS-encrypted end-to-end — even the relay can't read it. The
   relay socket stays connected as standby.
5. If it never opens (symmetric NATs, UDP-blocking firewalls, no WebRTC): the
   session simply keeps flowing through the relay. **No TURN server needed —
   the relay is Plan B.** The app can't tell the difference either way.

```
Host browser                relay.gifos.app              Client browser
     │── ws connect ────────────►│◄──────────── ws connect ──│
     │── SDP offer + ICE ───────►│── forwarded ─────────────►│
     │◄─ forwarded ──────────────│◄─ SDP answer + ICE ───────│
     │◄════ simultaneous packets punch NAT holes ═══════════►│
     │◄══════ direct encrypted DataChannel (P2P) ═══════════►│
     │        (relay idle — standby fallback only)           │
```

## The Idea

A GifOS app runs in its own tab. The desktop (parent/opener window) exposes a **runtime library** that gives the app a database. Where that database physically lives determines the app's role:

- **Server** — this browser holds the authoritative DB. It's the host.
- **Client** — this browser has no local DB for the session; its DB calls are forwarded to the server browser.

`gifos.app` sits between them as a **stateless relay** — it routes messages (and GIF bytes) between browsers and **stores nothing**.

```
┌───────────────────────────┐        ┌───────────────────────────┐
│  SERVER browser           │        │  CLIENT browser           │
│                           │        │                           │
│  ┌─────────────────────┐  │        │  ┌─────────────────────┐  │
│  │ app tab (iframe)    │  │        │  │ app tab (iframe)    │  │
│  │  calls runtime.db   │  │        │  │  calls runtime.db   │  │
│  └──────────┬──────────┘  │        │  └──────────┬──────────┘  │
│             ▼             │        │             ▼             │
│  ┌─────────────────────┐  │        │  ┌─────────────────────┐  │
│  │ runtime library     │  │        │  │ runtime library     │  │
│  │  ► central DB (auth)│  │        │  │  ► remote DB proxy  │  │
│  └──────────┬──────────┘  │        │  └──────────┬──────────┘  │
└─────────────┼─────────────┘        └─────────────┼─────────────┘
              │            ┌────────────────┐       │
              └───────────▶│   gifos.app    │◀──────┘
                           │  RELAY (dumb   │
                           │  message pipe, │
                           │  stores none)  │
                           └────────────────┘
```

## One DB API, Two Resolutions

The app developer writes against a single database API. The runtime resolves it based on the **launch URL**:

- **No remote session in the URL** → the runtime creates/opens a **local** authoritative DB. The app is the **server**.
- **A session (`s=`/`k=`) in the URL** → the runtime forwards every DB call over the relay to the server browser. The app is a **client**.

```javascript
// App-side — identical code whether server or client
const db = gifos.db('chess');           // runtime decides local vs remote
await db.put('moves', { n: 12, san: 'Qxf7#' });
const moves = await db.getAll('moves'); // server: local read; client: relayed read
db.subscribe('moves', render);          // server broadcasts changes to all clients
```

On the **server**, writes hit the local DB and the runtime **broadcasts** the change to every connected client through the relay. On a **client**, the call is serialized, sent over the relay, executed by the server's runtime, and the result is returned — plus the client receives broadcasts for live updates.

## Joining a Session (the Shareable URL)

When an app opens, its tab URL can be shared. It encodes what a new client needs:

```
https://gifos.app/run.html#s=<session-id>&k=<join-token>&relay=<relay-url>
```

```
Friend opens the join URL
   │
   ▼
Relay delivers the app GIF ──▶ client unpacks it into a new tab
   │
   ▼
Runtime sees s=/k= ──▶ CLIENT mode; opens a WebSocket to the relay
   │
   ▼
Server runtime validates the join token k ──▶ wires the client to the central DB
   │
   ▼
Client DB calls ⇄ relay ⇄ server DB;  server broadcasts ⇄ relay ⇄ clients
```

The **join token (`k`)** is a capability: it authorizes access to exactly one server session. The server's runtime validates it before bridging any DB traffic. The relay itself never reads or stores app data — it only routes by session id.

## State, Resume, and Failover (networking view)

- **Server state is authoritative and lives with the desktop icon.** Closing the tab suspends the session; reopening the icon restores the DB and issues a fresh session.
- **On close, the server chooses** *lock* (suspend clients until reopened) or *continue* (clients keep going while the server browser stays online — because that browser still owns the DB).
- **Clients can snapshot** the shared state to a self-contained GIF at any time.
- **Failover:** if the server browser dies, a client holding a snapshot can **Become Server** — its runtime loads the snapshot as a new central DB and the relay issues a new join URL for the remaining clients to reconnect. Recovery is only as fresh as the newest snapshot, so periodic client snapshots add resilience.

## The Relay Bandwidth Guard — control plane only, enforced server-side

The relay is for **control traffic**: DB ops, WebRTC signaling, one-time app
delivery. To guarantee nobody tunnels audio/video through it, every connection
gets a **token bucket** on the relay itself (`relay/src/relay.js` — not trusted
to the app):

- **Burst: 1 MB** — enough to deliver an App GIF to a joining client once.
- **Refill: 48 KB/s (~384 Kbps)** — below even low-quality video, so sustained
  streaming starves within seconds.
- Over-budget messages are **dropped** and the sender gets one
  `{ t:'error' }` explaining that media must go peer-to-peer.

The consequence is architectural, not advisory: high-bandwidth apps work over
direct WebRTC or not at all. The relay physically cannot become a media server.

## Mesh Signaling — peer-addressed routing

Beyond host↔client routing, the relay routes **peer-to-peer envelopes** so any
two participants in a session can exchange WebRTC introductions directly:

```
any → relay : { t:'peer', to:<peerId|'host'>, msg:{...} }
relay → dest: { t:'peer', from:<peerId|'host'>, msg:{...} }
relay → all : { t:'roster', peers:[...] }     ← current participant list
```

The roster + peer routing is what lets a **full mesh** form (every participant
connected to every other), which the Video Call app uses for media and which
future apps can use for any N-way topology. The relay still only ever sees
signaling envelopes.

### Built to scale (and to be attacked)

- **WebSocket hibernation**: the Durable Object accepts sockets through the
  Hibernation API, so an idle session or call room is evicted from memory and
  accrues **no duration charges** — Cloudflare bills actual messages, not
  wall-clock call length. Each socket's identity (role, peer id, name, ip,
  token, room password) rides in its serialized attachment, which survives
  eviction but dies with the connection — **the relay persists nothing,
  ever**. A room's token and password are properties of its current
  occupants: the first arrival to an empty room re-establishes them from
  their own session; everyone after that must match the people inside. One
  subtlety learned the hard way: with hibernation the server must **echo
  `ws.close()`** from `webSocketClose`, or the browser's close handshake
  never completes and client-side reconnect logic never fires.
- **Abuse guards**: 64 sockets per session, 8 per IP per session, 120
  joins/min per IP per session, plus a best-effort per-IP upgrade limiter in
  the outer Worker. Generous for humans (a NAT'd household of flappy phones
  never notices), hostile to loops. The bandwidth token-bucket (1 MB burst,
  ~384 Kbps sustained) still guarantees media can't tunnel through.

## Video Calls — strictly P2P mesh over permanent rooms

The Video Call system app (`video.html`) is the proof of the guard:

- **The room IS its URL — host-less and permanent.** The relay's `mesh` role
  has no host: whoever opens the link joins whoever is there, and the room
  outlives everyone in it (an empty room revives on the next join). The
  unguessable room code is the capability. Nobody's departure — including the
  creator's — can close a call link.
- Every participant holds one `RTCPeerConnection` per other participant. For
  each pair, exactly one side initiates, chosen by peer-id order — the same
  deterministic rule for joins, rejoins, and reloads, so there is no glare.
- **Peer relay — a volunteer TURN made of friends.** Every participant
  gossips its connectivity map; when a pair can't form (both ends behind
  strict NATs), the requester elects the smallest-id mutual friend, who
  re-sends the target's tracks over its own working connection
  (renegotiated over the DataChannel — only the relayer ever re-offers
  there, so no glare with room signaling). A stream-id mapping message tells
  the receiver whose tile the forwarded media belongs to. Relays tear down
  when a direct route forms (ICE restarts never stop trying), when the
  relayer or target leaves, and a phone volunteers at most 4 forwarded
  streams. Chat, pinned files, and tombstones take the same trip by
  gossip re-broadcast (dedupe by id stops loops). Media still never
  touches infrastructure — the bridge is a friend's browser.
- **Self-healing**: the relay socket auto-reconnects with backoff (kicked
  instantly on visibility/online); a degraded pair is re-offered with an ICE
  restart by its initiator; a roster-absent peer keeps its tile through a
  grace window (a locked phone is not a departure); a camera killed by tab
  backgrounding is re-acquired and `replaceTrack`ed into every link; and a
  participant with no camera permission joins view-only instead of being
  locked out.
- **Media flows only browser-to-browser.** The relay carries SDP/ICE envelopes
  and nothing else; if no direct route exists for a pair, that pair simply has
  no video — there is no fallback, by design.
- **Adaptive quality ladder**: with a mesh, upload cost grows with (n−1) links,
  so the app steps resolution, framerate, and per-link `maxBitrate` down as
  people join (720p/1.8Mbps → 480p/800k → 360p/450k → 240p/250k) and back up
  as they leave. Unlimited participants, degrading gracefully.
- It's a **system app** (trusted first-party page): the sandbox neuters WebRTC
  and an opaque origin can't get camera permission, so live media runs at the
  system level, routed from a whitelisted manifest field (see architecture doc).

## Why Browser-as-Server

| Property | Browser-as-server (GifOS) | Traditional app server |
|----------|---------------------------|------------------------|
| Where data lives | The host user's browser | Your servers |
| Infra to run | A stateless relay only | Databases, app servers, scaling |
| Cost model | Near-zero; relay is a message pipe | Grows with users and storage |
| Privacy | You never see or store user data | You hold everything |
| Failure mode | Snapshot failover to another peer | Central outage takes everyone down |

The tradeoff: sessions depend on the **host browser staying online** (mitigated by snapshot failover), and a single host browser has finite capacity (see *Multi-server* in the architecture doc's future work).

Staying online includes staying *runnable*: browsers freeze hidden tabs after a
few minutes (Chrome's Page Lifecycle), which would suspend the host's JS and
hang every client until the host refocuses. Any tab with a live session — host
or client — therefore holds a **Web Lock** (`gifos-live-session`), the
documented opt-out from tab freezing, and kicks its sockets on the lifecycle
`resume`/`pageshow` events in case a freeze happened anyway. A phone that
suspends the whole browser (screen off, app switch) is beyond any page's
control — that path is covered by reconnect, host-back re-sync, and Take Over
failover.

---

# Part 2 — External APIs: The postMessage Fetch Bridge

Some apps need to call third-party services (OpenAI, weather, a BaaS). Apps run inside an iframe, so the runtime brokers these calls — the app never gets raw network access or raw keys beyond what it supplies per request.

## The Problem

The app iframe should not be trusted with unrestricted network access, and some target APIs don't return CORS headers that satisfy a browser. The runtime solves both by proxying `fetch` on the app's behalf and enforcing the app's declared `network` allowlist.

## The Fetch Shim

When the runtime mounts the app, it injects a replacement `fetch()` before app code runs. The app developer writes normal `fetch()`; the runtime handles the rest.

```javascript
// Injected into the app iframe before app code executes
window.fetch = function(url, options) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    window.addEventListener('message', function handler(e) {
      if (e.data?.id === id) {
        window.removeEventListener('message', handler);
        if (e.data.error) reject(new Error(e.data.error));
        else resolve(new Response(e.data.body, {
          status: e.data.status,
          headers: new Headers(e.data.headers),
        }));
      }
    });
    parent.postMessage({
      type: 'fetch-request', id, url,
      method: options?.method || 'GET',
      headers: options?.headers || {},
      body: options?.body || null,
    }, '*');

    setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Fetch request timed out'));
    }, 30000);
  });
};
```

## Runtime-Side Handler (permission-enforced)

```javascript
window.addEventListener('message', async (event) => {
  if (event.data?.type !== 'fetch-request') return;
  const { id, url, method, headers, body } = event.data;
  const appFrame = event.source;

  // Enforce the app's declared network allowlist (manifest.json capabilities.network)
  const domain = new URL(url).hostname;
  if (!isAllowedDomain(currentApp, domain)) {
    appFrame.postMessage({ type: 'fetch-response', id,
      error: `Network access denied: ${domain} is not in this app's permissions` }, '*');
    return;
  }

  try {
    const response = await smartFetch(url, { method, headers, body });  // direct, then proxy
    const responseBody = await response.text();
    appFrame.postMessage({ type: 'fetch-response', id,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody }, '*');
  } catch (err) {
    appFrame.postMessage({ type: 'fetch-response', id, error: err.message }, '*');
  }
});

function isAllowedDomain(app, domain) {
  const allowed = app.manifest?.capabilities?.network || [];
  return allowed.some(p => p === '*' || domain === p || domain.endsWith('.' + p));
}
```

Apps declare what they may reach in `manifest.json`:

```json
{ "capabilities": { "network": ["api.openai.com", "*.supabase.co"] } }
```

The runtime can surface this to the user on launch (**Allow / Deny / Allow once**) and enforces it on every request. API keys the app supplies flow straight to the target service and are never stored by GifOS.

## CORS-Proxy Fallback (Cloudflare Worker)

Some APIs (e.g. Anthropic, as of early 2026) don't send `Access-Control-Allow-Origin`, so even a direct runtime `fetch()` is blocked by the browser. A tiny Cloudflare Worker acts as a transparent CORS proxy for those cases.

```javascript
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*',
        'Access-Control-Max-Age': '86400',
      }});
    }
    const url = new URL(request.url);
    const targetUrl = url.pathname.slice(1) + url.search;  // proxy.gifos.app/https://api.anthropic.com/...
    const response = await fetch(targetUrl, {
      method: request.method, headers: request.headers, body: request.body,
    });
    const out = new Response(response.body, response);
    out.headers.set('Access-Control-Allow-Origin', '*');
    out.headers.set('Access-Control-Allow-Credentials', 'true');
    return out;
  }
};
```

```javascript
async function smartFetch(url, options) {
  try {
    return await fetch(url, options);            // try direct first
  } catch (err) {
    if (err instanceof TypeError) {              // TypeError ≈ CORS block → retry via proxy
      return await fetch(`https://proxy.gifos.app/${url}`, options);
    }
    throw err;
  }
}
```

The Worker is a dumb pipe: it adds one CORS header and forwards everything else unchanged. **API keys still flow directly from the user to the target API** — the Worker doesn't log or persist them. CORS-friendly APIs (the growing majority) never touch the proxy.

### Deployment

```bash
npm install -g wrangler
wrangler init gifos-proxy
# paste the worker code into src/index.js
wrangler deploy
# → https://gifos-proxy.<your-subdomain>.workers.dev
# optionally map to proxy.gifos.app via a custom domain
```

## Two Relays, One Domain

`gifos.app` hosts two stateless edge functions with distinct jobs — neither stores user data:

| Endpoint | Job | Part |
|----------|-----|------|
| `gifos.app` (GitHub Pages) | Serve the static desktop + runtime — byte-for-byte what's in the public repo, so anyone can audit it | — |
| `relay.gifos.app` (Worker + Durable Objects, deployed from [`relay/`](../relay)) | WebRTC signaling, mesh peer routing, and fallback transport when P2P can't be established — bandwidth-guarded, stores nothing but the session/room token | Part 1 |
| `0.gifos.app` … `9.gifos.app` (Worker, deployed from [`mirror/`](../mirror)) | Re-serve the same static site so each digit subdomain is an isolated computer (per-origin storage); ten explicit routes, so other subdomains never invoke (or bill) the Worker | — |
| `proxy.gifos.app` (Worker, future) | Add CORS headers so apps can reach header-stingy third-party APIs | Part 2 |

Deploys: the site auto-publishes from `main` via GitHub Actions; the Workers
are manual (`npx wrangler deploy` inside `relay/` or `mirror/`) — **changing
relay code requires a redeploy**, pushing to GitHub is not enough.

## Future Enhancements

- **Network activity log** — the runtime shows users a DevTools-style request log.
- **Rate limiting** — per-app request caps enforced by the runtime.
- **Response caching** — respect `Cache-Control` for repeated external calls.
- **Credential manager** — the runtime stores API keys and injects them by reference, so apps never see raw keys.
- **End-to-end encrypted sessions** — encrypt relay payloads so even a compromised relay learns nothing.
