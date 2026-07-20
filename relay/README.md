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

**The relay only ever carries ciphertext and derivations.** Clients follow a
"derive, don't send" scheme (`site/js/gifos-net.js`): the session id in the
path and the `token`/`pw` query params are SHA-256 derivations of the link
secret (and password), compared for equality server-side; the content of every
routed frame (`msg` payloads) is AES-GCM sealed with a key derived from the
same secret and never sent. The relay's routing and gating code is unchanged —
it just knows strictly less.

## Session identity & the host gate

The session id in the URL (`/s/<sid>`) carries its own ownership rule, read by
one helper — `verifierOf(sid)`: the `[a-f0-9]{16,64}` tail after the **last dot**,
or empty if there is none. Apps and meetings use it identically, so there is no
`?av=` (or any other) authority parameter — the verifier only ever travels inside
the id.

- **Dotless id → anyone-owns.** Any socket may claim the `host`/`mesh` slot; the
  slot is guarded only by an **epoch** (monotone connection counter — a stale host
  reconnecting with a lower epoch is bounced), which is what lets a self-healing
  session promote a new host. No secret, no admin.
- **`<room>.<verifier>` → owned / admin.** The relay grants authority only to a
  socket that proves a secret in `adm`: it hashes `adm` with SHA-256 and requires
  the result to **start with the verifier**. For an app that gates the *host slot*
  (a link-holder can still join as a guest); for a meeting it grants **admin**
  (password-only powers: room password, global mute/blur, device bans). The secret
  itself never reaches the relay in the clear beyond this one proof, and never
  appears in any link.

The relay **stores none of this** — the verifier is recomputed from the id and the
proof is checked per connection, so nothing about ownership persists server-side.

## Local testing

`test/servers/relay-local.js` is a dependency-free Node server that speaks the same
protocol, used by `test/browser/e2e-relay.js`. It is **not** for production — deploy the
Worker for real use.
