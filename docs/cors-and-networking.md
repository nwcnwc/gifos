# GifOS Networking

GifOS apps have two distinct networking needs, and this document covers both:

1. **Browser-as-server** — one browser hosts a database and others connect to it, so an app can be multiplayer/multi-user. This is the primary model, built on the stateless `gifos.app` relay. **(Part 1)**
2. **External APIs** — an app calls a third-party service (OpenAI, a weather API, a database-as-a-service). This uses a postMessage fetch bridge with a CORS-proxy fallback. **(Part 2)**

Both share one principle: **nothing of the user's lives on our infrastructure.** The relay only passes messages; API keys only ever exist on the user's device.

---

# Part 1 — Browser-as-Server: The DB Relay

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
https://gifos.app/run#s=<session-id>&app=<gif-locator>&k=<join-token>
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

## Why Browser-as-Server

| Property | Browser-as-server (GifOS) | Traditional app server |
|----------|---------------------------|------------------------|
| Where data lives | The host user's browser | Your servers |
| Infra to run | A stateless relay only | Databases, app servers, scaling |
| Cost model | Near-zero; relay is a message pipe | Grows with users and storage |
| Privacy | You never see or store user data | You hold everything |
| Failure mode | Snapshot failover to another peer | Central outage takes everyone down |

The tradeoff: sessions depend on the **host browser staying online** (mitigated by snapshot failover), and a single host browser has finite capacity (see *Multi-server* in the architecture doc's future work).

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
| `gifos.app` relay (WebSocket) | Route DB messages + GIFs between server and client browsers | Part 1 |
| `proxy.gifos.app` (Worker) | Add CORS headers so apps can reach header-stingy third-party APIs | Part 2 |

## Future Enhancements

- **Network activity log** — the runtime shows users a DevTools-style request log.
- **Rate limiting** — per-app request caps enforced by the runtime.
- **Response caching** — respect `Cache-Control` for repeated external calls.
- **Credential manager** — the runtime stores API keys and injects them by reference, so apps never see raw keys.
- **End-to-end encrypted sessions** — encrypt relay payloads so even a compromised relay learns nothing.
