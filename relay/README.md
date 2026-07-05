# gifos-relay

A stateless WebSocket message hub for GifOS multiplayer. It routes messages
between the **host** browser (which owns the database) and **client** browsers
that join a session. It stores nothing — no app data, no GIFs, no DB contents.
It's a Cloudflare Worker backed by a Durable Object (one live session hub per
session id).

## Deploy

```bash
cd relay
npm install -g wrangler        # if you don't have it
wrangler login                 # authorize your Cloudflare account
wrangler deploy
# → https://gifos-relay.<your-subdomain>.workers.dev
```

Then point the app at it — edit `site/js/relay-config.js`:

```js
window.GIFOS_RELAY = 'wss://gifos-relay.<your-subdomain>.workers.dev';
```

### Optional: map a custom domain

Uncomment the `[[routes]]` block in `wrangler.toml` to serve from
`wss://relay.gifos.app` (add a DNS record for `relay` in your registrar first,
or let Cloudflare manage the zone), then redeploy and set
`window.GIFOS_RELAY = 'wss://relay.gifos.app'`.

## Protocol

All frames are JSON text. See `src/relay.js` for the full contract. In short:

| From → To | Message | Meaning |
|-----------|---------|---------|
| client → relay | `{t:'rpc', ...}` | delivered to host as `{t:'from', from, msg}` |
| host → relay | `{t:'to', to, msg}` | delivered to one client as `msg` |
| host → relay | `{t:'bcast', msg}` | delivered to every client as `msg` |
| relay → host | `{t:'peer-join'|'peer-leave', peer}` | membership changes |
| relay → client | `{t:'joined'}` / `{t:'host-gone'}` / `{t:'error'}` | lifecycle |

The host delivers the App GIF to each joining client over this channel
(`{t:'app', gif}`), so a brand-new client needs only the share link — the app
itself arrives peer-to-peer through the relay.

## Local testing

`test/relay-local.js` is a dependency-free Node server that speaks the same
protocol, used by `test/e2e-relay.js`. It is **not** for production — deploy the
Worker for real use.
