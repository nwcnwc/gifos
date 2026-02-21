# GIFOS Networking: The postMessage Bridge Pattern

## The Problem

GIFOS apps run inside sandboxed iframes. Sandboxed iframes get a `null` origin, which means:

- Browsers block all cross-origin `fetch()` / `XMLHttpRequest` calls
- External APIs reject requests from `null` origins
- CORS headers don't help — there's no real origin to whitelist

This is by design — the sandbox protects users from malicious app code. But legitimate apps need to talk to APIs (OpenAI, weather services, databases, etc.).

## The Solution: postMessage Bridge

The shell (top-level page) acts as a trusted network proxy. It's not sandboxed, so it can make normal `fetch()` calls with no CORS restrictions.

### How It Works

```
┌─────────────────────────────────────────────────┐
│  User's Browser                                 │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │  GIFOS Shell (top-level page)            │   │
│  │  - Real origin (gifos.app or file://)    │   │
│  │  - Can fetch() any URL                   │   │
│  │  - Enforces permission allowlist         │   │
│  │                                          │   │
│  │  ┌──────────────────────────────────┐    │   │
│  │  │  App GIF (sandboxed iframe)      │    │   │
│  │  │  - null origin                   │    │   │
│  │  │  - Cannot fetch externally  ❌   │    │   │
│  │  │  - CAN postMessage to parent ✅  │    │   │
│  │  └──────────────────────────────────┘    │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  Direct connection: Browser ──→ External API    │
│  No server in the middle.                       │
└─────────────────────────────────────────────────┘
```

## The Full Request Chain

```
App GIF (sandboxed iframe)
    ↓
Shimmed fetch() / XMLHttpRequest
    ↓  (postMessage)
GIFOS Shell (top-level window)
    ↓
Try direct fetch()
    ↓
Works? → Return response via postMessage
    ↓
CORS blocked? → Retry through proxy.gifos.app (Cloudflare Worker)
    ↓
Return response via postMessage
    ↓
App gets its data, never knew the difference
```

Three layers of networking, zero complexity for the app developer. They write standard `fetch()` calls. The platform handles the rest.

## The Fetch Shim

When the shell loads an app GIF into the sandboxed iframe, it injects a replacement `fetch()` before the app code runs. The app developer never sees this — their code uses normal `fetch()` and it just works.

```javascript
// Injected into iframe before app code executes
window.fetch = function(url, options) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    window.addEventListener('message', function handler(e) {
      if (e.data?.id === id) {
        window.removeEventListener('message', handler);
        if (e.data.error) {
          reject(new Error(e.data.error));
        } else {
          resolve(new Response(e.data.body, {
            status: e.data.status,
            headers: new Headers(e.data.headers),
          }));
        }
      }
    });
    parent.postMessage({
      type: 'fetch-request',
      id,
      url,
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

### App-Side Code (inside the GIF app)

```javascript
// Request an external API call
function apiFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();

    function handler(event) {
      if (event.data?.type === 'fetch-response' && event.data.id === id) {
        window.removeEventListener('message', handler);
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve({
            status: event.data.status,
            headers: event.data.headers,
            body: event.data.body,
            json: () => Promise.resolve(JSON.parse(event.data.body)),
            text: () => Promise.resolve(event.data.body),
          });
        }
      }
    }

    window.addEventListener('message', handler);
    window.parent.postMessage({
      type: 'fetch-request',
      id,
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || null,
    }, '*');

    // Timeout after 30s
    setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Fetch request timed out'));
    }, 30000);
  });
}

// Usage — feels just like normal fetch()
const response = await apiFetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sk-...',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] }),
});
const data = await response.json();
```

### Shell-Side Code (in the GIFOS runtime)

```javascript
// Listen for fetch requests from sandboxed apps
window.addEventListener('message', async (event) => {
  if (event.data?.type !== 'fetch-request') return;

  const { id, url, method, headers, body } = event.data;
  const appFrame = event.source;

  // Check permissions — does this app have network access to this domain?
  const domain = new URL(url).hostname;
  if (!isAllowedDomain(currentApp, domain)) {
    appFrame.postMessage({
      type: 'fetch-response',
      id,
      error: `Network access denied: ${domain} is not in this app's permissions`,
    }, '*');
    return;
  }

  try {
    // Smart fallback: try direct, fall back to CORS proxy
    const response = await smartFetch(url, { method, headers, body });
    const responseBody = await response.text();

    appFrame.postMessage({
      type: 'fetch-response',
      id,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
    }, '*');
  } catch (err) {
    appFrame.postMessage({
      type: 'fetch-response',
      id,
      error: err.message,
    }, '*');
  }
});

function isAllowedDomain(app, domain) {
  const allowed = app.permissions?.network || [];
  return allowed.some(pattern =>
    pattern === '*' || domain === pattern || domain.endsWith('.' + pattern)
  );
}
```

## Permission Model

Apps declare required network access in their manifest:

```json
{
  "permissions": {
    "network": ["api.openai.com", "api.weather.gov", "*.supabase.co"]
  }
}
```

When an app is loaded, the shell can prompt the user:

> **"Simple CRM" wants network access to:**
> - api.openai.com
> - *.supabase.co
>
> **[Allow]** **[Deny]** **[Allow Once]**

The shell enforces the allowlist on every request. Apps cannot reach domains they didn't declare.

## Why This Is Better Than a Server Proxy

Traditional approach (e.g., the `/api/fetch` pattern):

```
Browser → Your Server → External API → Your Server → Browser
```

Problems:
- **API keys flow through your server** — security liability
- **Bandwidth costs** — you pay for all proxied traffic
- **Latency** — extra hop adds delay
- **Scaling** — more users = more server load
- **Single point of failure** — server goes down, all apps lose network
- **Privacy** — you can see every request your users make

GIFOS postMessage bridge:

```
Browser → External API → Browser
```

Benefits:
- **API keys never leave the user's device** — zero key exposure
- **Zero bandwidth costs** — traffic doesn't touch your infrastructure
- **Lower latency** — direct connection, no middleman
- **Infinite scaling** — no server involvement
- **No single point of failure** — works offline (for cached APIs), works if gifos.app is down
- **Full privacy** — you never see user traffic

## When You Still Need a Server

A few edge cases where a server proxy might be necessary:

1. **APIs that restrict origins** — some APIs only allow server-to-server calls (no browser `Origin` header accepted). Rare but exists.
2. **OAuth flows** — token exchange often requires a server-side secret. Could be handled by a minimal auth endpoint on gifos.app.
3. **WebSocket bridges** — if an API only offers WebSocket and the sandbox blocks it.

For these cases, gifos.app could offer an optional lightweight proxy. But 95%+ of use cases work with the direct postMessage bridge.

## Fallback: Cloudflare Worker CORS Proxy

Some APIs (e.g., Anthropic as of Feb 2026) don't send `Access-Control-Allow-Origin` headers, so even the shell's direct `fetch()` gets blocked by the browser. For these APIs, a lightweight Cloudflare Worker acts as a transparent CORS proxy.

### Worker Code (~20 lines)

```javascript
export default {
  async fetch(request) {
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Target URL is the path: proxy.gifos.app/https://api.anthropic.com/v1/messages
    const url = new URL(request.url);
    const targetUrl = url.pathname.slice(1) + url.search;

    // Forward request unchanged (API keys stay in headers, never stored)
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    // Add the missing CORS header
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
    return newResponse;
  }
};
```

### Why This Is Different From a Server Proxy

A traditional server proxy (like LivePresenter's `/api/fetch`) runs on your own server. A Cloudflare Worker:

- **Runs on Cloudflare's edge** — 300+ locations, ~1ms added latency
- **Free tier:** 100K requests/day (more than enough for most apps)
- **Zero infrastructure** — no server to maintain, scale, or monitor
- **Not storing anything** — it's a dumb pipe that adds one HTTP header
- **API keys still flow directly from user to API** — the Worker forwards headers unchanged, doesn't log or persist them

### Smart Fallback in the Shell

The shell can try a direct fetch first, and only fall back to the proxy if CORS blocks it:

The shell handles the three-layer fallback transparently:

```javascript
async function smartFetch(url, options) {
  try {
    // Try direct first
    return await fetch(url, options);
  } catch (err) {
    if (err instanceof TypeError) {
      // TypeError usually means CORS block — retry through proxy
      const proxyUrl = `https://proxy.gifos.app/${url}`;
      return await fetch(proxyUrl, options);
    }
    throw err;
  }
}
```

This means apps that work with CORS-friendly APIs (growing majority) never touch the proxy at all. The proxy is only used when strictly necessary.

### Deployment

```bash
npm install -g wrangler
wrangler init gifos-proxy
# paste the worker code into src/index.js
wrangler deploy
# → https://gifos-proxy.<your-subdomain>.workers.dev
# optionally map to proxy.gifos.app via custom domain
```

## Future Enhancements

- **Request logging** — shell could show users a network activity log (like browser DevTools)
- **Rate limiting** — shell enforces per-app rate limits to prevent abuse
- **Caching** — shell caches repeated requests (respect Cache-Control headers)
- **Credential manager** — shell stores API keys securely, injects them into requests so apps never see raw keys (just a key reference ID)
