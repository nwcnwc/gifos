# GifOS Networking

GifOS apps have two distinct networking needs, and this document covers both:

1. **Browser-as-server** — one browser holds the authoritative app state and others mirror it, so an app can be multiplayer/multi-user. This is the primary model: a peer-to-peer mesh room, with the stateless `gifos.app` relay as the introduction service. **(Part 1)**
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
4. If a DataChannel opens (~80–90% of networks): all session traffic moves
   onto it, direct and DTLS-encrypted end-to-end — even the relay can't read
   it. The relay socket stays connected as standby.
5. If it never opens (symmetric NATs, UDP-blocking firewalls, no WebRTC): the
   session simply keeps flowing through the relay. **No TURN server needed —
   the relay is Plan B.** The app can't tell the difference either way.

The shared transport fabric (`site/js/gifos-net.js`) names these three rungs and
tries them in order: **P0** — a direct WebRTC DataChannel to the destination;
**P1** — one hop *through a mutual friend's browser* (`{t:'fwd'}` over two
DataChannels), the account-free stand-in for TURN; **P2** — the relay WebSocket
(the bandwidth-capped control plane). App-GIF traffic falls P0 → P1 → P2; in a
meeting, chat/control fall P0 → P1 → P2 while **media and file bodies ride P0 →
P1 only and NEVER the relay**. There is **no TURN server anywhere** — the ICE
config is STUN-only.

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

A GifOS app runs in its own tab. The runtime gives the app a database
(`gifos.db`); where the **authoritative** copy of that database lives
determines the app's role in a shared session:

- **Owner (host)** — this browser holds the authoritative store, persisted
  with the desktop icon. Every state frame it emits is signed with a
  per-session Ed25519 owner key (`site/js/app-owner.js`).
- **Guest (client)** — this browser holds an owner-**verified mirror**. Reads
  are local; writes are optimistic local applies PLUS an `act` **proposal**
  to the owner, whose next signed frame is the canonical truth.

There is no server in the middle, and — since the one-runtime flag day
(`docs/one-runtime.md`) — no relay data plane either: **a shared app session
IS a mesh room.** State snapshots, deltas, and the app GIF bytes themselves
travel peer-to-peer over the room's DataChannels, owner-signed so a relaying
peer can carry them but never forge them. `gifos.app`'s relay is the
**introduction service**: a stateless greeter + door that carries WebRTC
signaling envelopes and stores nothing.

```
┌───────────────────────────┐        ┌───────────────────────────┐
│  OWNER browser            │        │  GUEST browser            │
│  app iframe → gifos.db    │        │  app iframe → gifos.db    │
│  authoritative store,     │        │  owner-verified mirror;   │
│  signs snap/delta frames  │        │  writes become proposals  │
└──────────┬────────────────┘        └──────────┬────────────────┘
           │  owner-signed state + app bytes    │
           └────── room mesh (WebRTC DCs) ──────┘
                          ▲
                          │  signaling only (knock, peer envelopes)
                 ┌────────┴────────┐
                 │ relay.gifos.app │  stateless greeter + door
                 └─────────────────┘
```

## One DB API, Two Resolutions

The app developer writes against a single database API; the runtime resolves
it by how the app was mounted (your own icon vs somebody's invite link):

```javascript
// App-side — identical code whether owner or guest
const db = gifos.db('moves');            // one handle per collection
await db.put({ n: 12, san: 'Qxf7#' });   // owner: local write, then a signed
                                         //   delta floods the room;
                                         // guest: optimistic apply + an act
                                         //   proposal the owner validates
const moves = await db.getAll();         // owner: local read; guest: mirror read
db.subscribe(render);                    // fires now and on every change
```

Collections the manifest declares `private` never leave a participant's own
tab at all; `read-only` collections reject guest writes with a readable
error. The app-facing rules (visibility declarations, guest semantics, the
leader fence) are in `site/llms.txt` → "Multiplayer".

## Joining a Session (the Shareable URL)

The Invite button mints a link that IS the capability — one short code from
which everything derives ("derive, don't send", `site/js/gifos-net.js`):

```
https://gifos.app/join/<room>/<verifier>/<code>   owned link (production)
https://gifos.app/join/<code>                     self-healing link (production)
https://gifos.app/run.html#s=<room>.<verifier>&k=<code>&relay=<url>
https://gifos.app/run.html#j=<code>&relay=<url>   (hash forms: local dev,
                                                   custom relays)
```

```
Friend opens the join URL
   │
   ▼
Knocks at the relay ──▶ seated into the ROOM MESH (peer-to-peer)
   │
   ▼
The app GIF arrives as an owner-SIGNED frame from whichever PEER already
holds it (the owner seeded it once; every node retains it)
   │
   ▼
Owner-signed snapshots/deltas keep the guest's mirror current;
the guest's writes travel back as act proposals over the same mesh
```

The relay only ever sees SHA-256 **derivations** of the code (the session id
it routes on, the join token it equality-checks); the end-to-end key derives
from the same code and is sent nowhere. The relay never reads or stores app
data — app frames do not ride it at all.

## State, Resume, and Failover (networking view)

- **Server state is authoritative and lives with the desktop icon.** Closing the tab suspends the session; reopening the icon restores the DB and resumes (or re-mints) the link.
- **Two dials, set at Invite** (see [architecture.md](architecture.md) → *Multiplayer & data*): **Lifetime** (how long the link admits *new* joiners: `close`/`1h`/`24h`/`forever`) and **Resilience** (`heal` — whether a still-connected guest may take over if the host drops). They are orthogonal, so a `1h` game can still be resilient.
- **Clients can snapshot** the shared state to a self-contained GIF at any time.
- **Succession (resilient links only):** with resilience **on** (`/join/<code>`, anyone-owns), guests mirror the full state; when the owner's seat is confirmed gone, every seat computes the **same successor** — the lowest-seated participant holding a full mirror — which mints a fresh owner key and announces it signed with its mesh identity. Deterministic, no race, no server (`docs/one-runtime.md` → "Ownership and succession"). With resilience **off** (owned links) there is **no automatic succession**: the verifier is the maker's trust anchor and never silently transfers. Writes freeze politely ("the owner is away"), reads continue from the retained snapshot, and the owner returning resumes.

## The Relay Bandwidth Guard — control plane only, enforced server-side

The relay is for **signaling**: knocks, WebRTC introduction envelopes, the
signed door verbs (password / ban / kick), and sealed chat-class fallback
envelopes in meetings — never media, and never app data frames. To guarantee
nobody tunnels audio/video through it, every connection gets a **token
bucket** on the relay itself (`relay/src/relay.js` — not trusted to the app):

- **Burst: 1 MB** one-time.
- **Refill: 48 KB/s (~384 Kbps)** — below even low-quality video, so sustained
  streaming starves within seconds.
- Over-budget messages are **dropped** and the sender gets one
  `{ t:'error' }` explaining that media must go peer-to-peer.

The consequence is architectural, not advisory: high-bandwidth apps work over
direct WebRTC or not at all. The relay physically cannot become a media server.

## Mesh Signaling — peer-addressed routing

The relay routes **peer-to-peer envelopes** so any two participants in a
session can exchange WebRTC introductions directly:

```
any → relay : { t:'peer', to:<peerId|'host'>, msg:{...} }
relay → dest: { t:'peer', from:<peerId|'host'>, msg:{...} }
relay → all : { t:'roster', peers:[...] }     ← current participant list
```

The roster + peer routing is what lets APP sessions form any N-way topology.
The relay still only ever sees signaling envelopes.

**Meetings are different now (the no-root mesh).** A meeting session is NOT
the room — it is the stadium's FRONT DOOR: a zero-knowledge greeter registry
(`{t:'knock', gk, gblob}` → `{t:'greeters', list, founded, admitted}`,
docs/healing-laws.md R2/R3). The relay holds only `H(genesis key)` + TTL'd
SEALED greeter addresses; seating, healing, and room-wide traffic (chat,
status, votes) ride the mesh itself — `site/js/mesh.js` over WebRTC
DataChannels, bound by `site/js/mesh-wire.js`. Members hold a relay socket
only while joining or serving as Section-1 greeters; the session cap (C²+C)
is the greeter pool plus knock churn, not the room size. A room that fits in
Section 1 still renders as a full mesh of tiles — the Section tier's
degenerate case — and larger rooms scale by the tree
(docs/media-plane.md), never by relay fan-out.

### Built to scale (and to be attacked)

- **WebSocket hibernation**: the Durable Object accepts sockets through the
  Hibernation API, so an idle session or meeting room is evicted from memory and
  accrues **no duration charges** — Cloudflare bills actual messages, not
  wall-clock meeting length. Each socket's identity (role, peer id, name, ip,
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
- **Origin allowlist**: the Worker rejects WebSocket upgrades whose `Origin`
  is not `gifos.app` (or a subdomain, or localhost, or absent) with a `403`.
  Browsers set `Origin` themselves and page JS cannot forge it, so this
  reliably stops a random website from using the relay as a free message bus.
  It is *not* a boundary against non-browser clients (curl can send any
  `Origin`) — those are what the per-IP and bandwidth caps are for; the two
  layers compose. Configurable via the `ALLOWED_ORIGINS` env var
  (comma-separated exact origins and/or `*.host` suffix patterns; `*` opens
  it up); the built-in default covers gifos.app and its subdomains, and
  localhost is always allowed so dev and CI work. Unit-tested in
  `test/relay/relay-origin.js`.

## Meetings — strictly P2P mesh over permanent rooms

The Meeting system app (`run.html`) is the proof of the guard:

- **The room IS its URL — host-less and permanent.** The relay's `mesh` role
  has no host: whoever opens the link joins whoever is there, and the room
  outlives everyone in it (an empty room revives on the next join). The
  unguessable room code is the capability. Nobody's departure — including the
  creator's — can close a meeting link.
- **The relay never learns the room code, the password, or a byte of content**
  ("derive, don't send" — `site/js/gifos-net.js`). The session id it routes on
  and the token it equality-checks are SHA-256 derivations of the room code;
  the password gate compares room-salted password *proofs*; and every content
  frame — signaling gossip, chat, file chunks — is sealed with an AES-GCM key
  derived from the same code and sent nowhere. Anyone holding the link derives
  the key offline, so there is no key exchange to fail.
- Every participant holds one `RTCPeerConnection` per other participant. For
  each pair, exactly one side initiates, chosen by peer-id order — the same
  deterministic rule for joins, rejoins, and reloads, so there is no glare.
- **Peer relay (P1) — a volunteer bridge made of friends, never a TURN
  server.** GifOS configures **STUN only, no TURN, ever** (`site/js/gifos-net.js`
  ice servers) — a TURN server is a media relay, which the whole design forbids.
  Instead every participant
  gossips its connectivity map; when a pair can't form (both ends behind
  strict NATs), the requester elects the smallest-id mutual friend, who
  re-sends the target's tracks over its own working connection
  (renegotiated over the DataChannel — only the relayer ever re-offers
  there, so no glare with room signaling). A stream-id mapping message tells
  the receiver whose tile the forwarded media belongs to. Relays tear down
  when a direct route forms (ICE restarts never stop trying), when the
  relayer or target leaves, and a phone volunteers at most 4 forwarded
  streams. Chat, pinned files, and tombstones take the same trip by
  gossip re-broadcast (dedupe by id stops loops) — and chat-class frames
  (chat, transcripts, file metas/tombstones, the union-merge sync) additionally
  fall back to **sealed envelopes over the relay** for a pair with no
  DataChannel at all, so a fully P2P-blocked participant still converses.
  File BODIES never do (P0/P1 only — the budget guard stands). Media still
  never touches infrastructure — the bridge is a friend's browser.
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
| Failure mode | Resilient rooms heal by deterministic succession; owned rooms freeze politely until the owner returns | Central outage takes everyone down |

The tradeoff: a session depends on **somebody who holds the state staying in the room**. Owner loss is handled per room class (see *Succession* above): a resilient room's mirrors elect a deterministic successor and the same link keeps working with no clicks; an owned room freezes writes honestly rather than transfer the maker's trust anchor. A session with everyone gone goes dormant and resumes when anyone who holds a copy (the original icon, or a saved snapshot) reopens it — the state lives in browsers and in GIF files, never on infrastructure.

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

The app iframe should not be trusted with unrestricted network access, and some target APIs don't return CORS headers that satisfy a browser. The runtime solves both by executing fetches on the app's behalf and enforcing the app's declared `network` allowlist.

## The bridge, as it actually is

The sandbox's own `fetch`/XHR/WebSocket are dead (`connect-src 'none'`), and
the runtime does **not** monkey-patch them back: the app calls
**`gifos.fetch(url, opts)`**, a postMessage RPC that the trusted OS page
executes on the app's behalf (`bridgeFetch` in `site/js/runtime.js`).
Enforced on every request, **before a byte is read**:

- the target host must be in the app's declared, user-approved allowlist
  (`manifest.json` → `capabilities.network`; a host matches itself and its
  subdomains; `"*"` is legal and loudly surfaced on the permission sheet);
- https only (http for localhost dev); never the GifOS origin or its
  subdomains, so an app cannot turn the trusted first-party into a proxy for
  the relay or the site itself;
- credentials are never attached; redirects are re-checked against the
  allowlist; responses are capped at 8 MB.

```json
{ "capabilities": { "network": ["api.openai.com", "overpass-api.de"] } }
```

The user sees the declared list at launch and can veto hosts individually;
the veto persists with the icon (`<fileId>::netperms`) and the runtime gates
every bridged fetch on the live policy. The app-facing contract — request
options, response shape, pooling — is documented in `site/llms.txt` →
"Network".

## CORS-Proxy Fallback (Cloudflare Worker)

Some APIs (e.g. Anthropic, as of early 2026) don't send
`Access-Control-Allow-Origin`, so even the OS page's fetch is blocked by the
browser. The production proxy is **`cors-proxy.gifos.app`** (source in
[`cors-proxy/`](../cors-proxy)): the caller sends the true destination in an
`x-gifos-target` header; the Worker forwards the request and adds the CORS
headers. It is **not** an open proxy — it serves only `gifos.app` origins and
only forwards to a curated **host allow-list** (`ALLOW_HOSTS` in
`cors-proxy/src/cors-proxy.js`); adding a host is one line + a
`wrangler deploy`. And there is **no automatic direct-then-proxy retry**:
routing through the proxy is an explicit, per-call or per-API choice (below),
so where a request went is always knowable.

### From a sandboxed app: `gifos.fetch(url, { proxy: true })`

The production proxy is `cors-proxy.gifos.app` (source in `cors-proxy/`). It is **not** open — it only serves `gifos.app` origins and only forwards to a curated **host allow-list** (`ALLOW_HOSTS` in `cors-proxy/src/cors-proxy.js`), passing the true destination in an `x-gifos-target` header. Adding a host means one line + a `wrangler deploy`.

Two ways an app reaches it:

- **`api` capability** — a keyed third-party API configured in *Settings → Third-party APIs* with the per-API "use CORS proxy" toggle. The runtime attaches the credential and routes through the proxy (see `brokerApi`).
- **`network` capability** — for **public** data with no key. The app declares the host under `capabilities.network` and calls `gifos.fetch(url, { proxy: true })`. The runtime still gates the call on the declared-host allow-list, then routes it through `cors-proxy.gifos.app` (which enforces its own `ALLOW_HOSTS`). The app can **only** select the default GifOS proxy — never an arbitrary URL — so the bridge can't become an exfiltration channel; a self-hosted deployment overrides the base once via `window.GIFOS_CORS_PROXY`. The default **Bible Browser** app (`sample-apps.js`) is a live demo: it reads `text.recoveryversion.bible` (which sends no CORS headers) entirely through this path.

### Response bodies: any content type

The bridge is content-type agnostic. A response crosses the postMessage boundary
as **raw bytes** (an `ArrayBuffer`, carried natively by structured clone — the
same way brokered capture and `gifos.api`'s `as:'bytes'` already work), and the
in-app shim decodes on demand:

```javascript
const r = await gifos.fetch('https://example.com/tile.png');
await r.json();         // API responses
await r.text();         //   "
await r.arrayBuffer();  // binary — byte-exact
const url = URL.createObjectURL(await r.blob());   // the app CSP allows img-src blob:
```

Until 2026-08 the bridge ran **every** body through a UTF-8 `TextDecoder`, which
replaced each invalid sequence with U+FFFD and so made images, tiles and audio
unreachable. That was an accident of reusing the GIF codec's text helper, not a
boundary: **nothing in the trust model depends on the body's shape.** What an app
may reach is decided by the manifest host allowlist the user explicitly approves
(`gifos-perms.js`), plus https-only, the first-party refusal, `credentials:'omit'`,
the post-redirect host re-check, and the 8 MB cap — all enforced on the *request*,
before a byte is read. `e2e-fetch-bridge.js` guards the round-trip.

The Worker is a dumb pipe: it adds one CORS header and forwards everything else unchanged. **API keys still flow directly from the user to the target API** — the Worker doesn't log or persist them. CORS-friendly APIs (the growing majority) never touch the proxy.

### Deployment

The production proxy deploys from this repo:

```bash
cd cors-proxy && npx wrangler deploy    # → cors-proxy.gifos.app
```

A self-hosted GifOS points its apps at its own copy by setting
`window.GIFOS_CORS_PROXY` once (and protects its own sibling services with
`window.GIFOS_FIRST_PARTY`); apps can never name an arbitrary proxy URL.

## The edge functions, one domain

`gifos.app` fronts a handful of stateless edge functions with distinct jobs — none stores user data:

| Endpoint | Job | Part |
|----------|-----|------|
| `gifos.app` (GitHub Pages) | Serve the static desktop + runtime — byte-for-byte what's in the public repo, so anyone can audit it | — |
| `relay.gifos.app` (Worker + Durable Objects, deployed from [`relay/`](../relay)) | For app sessions: WebRTC signaling, peer routing, and bandwidth-guarded fallback transport (**never media**). For meetings: a **zero-knowledge greeter registry** only (`docs/healing-laws.md` R2). Stores nothing but per-connection socket state | Part 1 |
| `0.gifos.app` … `9.gifos.app` (Worker, deployed from [`mirror/`](../mirror)) | Re-serve the same static site so each digit subdomain is an isolated computer (per-origin storage); ten explicit routes, so other subdomains never invoke (or bill) the Worker | — |
| `cors-proxy.gifos.app` (Worker, deployed from [`cors-proxy/`](../cors-proxy)) | Add CORS headers so apps can reach header-stingy third-party APIs — gated to `gifos.app` origins and an allow-list of hosts, stores nothing | Part 2 |

Deploys: the site auto-publishes from `main` via GitHub Actions; the Workers
are manual (`npx wrangler deploy` inside `relay/` or `mirror/`) — **changing
relay code requires a redeploy**, pushing to GitHub is not enough.

## Future Enhancements

- **Network activity log** — the runtime shows users a DevTools-style request log.
- **Rate limiting** — per-app request caps enforced by the runtime.
- **Response caching** — respect `Cache-Control` for repeated external requests.

Two items that used to sit on this list have shipped and are documented
above: the **credential manager** (Settings → Third-party APIs + `gifos.api`
— the runtime attaches keys and pins them to the configured host; apps never
see them) and **end-to-end encrypted sessions** ("derive, don't send" —
content frames are sealed with a key derived from the link code, which the
relay never holds).
