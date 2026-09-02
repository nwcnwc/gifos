# gifos-relay

A stateless WebSocket **greeter + door** for GifOS rooms. Every room —
meeting or shared app — is a mesh room: room-wide traffic (app state, media,
chat, the App GIF itself) rides the room's own WebRTC mesh, owner-/admin-signed.
The relay only holds each room's sealed greeter registry and routes sealed
first-contact signaling; the old host/client star was deleted on the
one-runtime flag day (2026-08-01), and a socket claiming any role but `mesh`
is refused (close code 4010). It stores nothing — no app data, no GIFs, no DB
contents. It's a Cloudflare Worker backed by a Durable Object (one live door
per session id).

## Deploy

```bash
cd relay
npm install -g wrangler        # if you don't have it
wrangler login                 # authorize your Cloudflare account
wrangler deploy
# → https://gifos-relay.<your-subdomain>.workers.dev

# Once per deployment, and BEFORE the first real room: the per-IP abuse
# caps key on a salted hash of each socket's address (relay.js ipTag).
# Without this secret the salt is a public constant from the source, so a
# state or log dump is brute-forceable back to IPv4 addresses. The Worker
# logs "ABUSE_SALT unset" once per isolate while it is missing.
openssl rand -hex 32 | wrangler secret put ABUSE_SALT
```

Then point the app at it — edit `site/js/relay-config.js`:

```js
window.GIFOS_RELAY = 'wss://gifos-relay.<your-subdomain>.workers.dev';
```

### Custom domain

The `[[routes]]` blocks in `wrangler.toml` map `wss://relay.gifos.app` (both
the custom-domain and zone-route entries are active and load-bearing for the
production deploy). For your own fork, point them at your zone — add a DNS
record for `relay` in your registrar first, or let Cloudflare manage the
zone — then redeploy and set `window.GIFOS_RELAY = 'wss://relay.<your-zone>'`.

## Protocol

All frames are JSON text. See `src/relay.js` for the full contract. In short:

| From → To | Message | Meaning |
|-----------|---------|---------|
| mesh → relay | `{t:'knock', gk, gblob}` | (re)register as a greeter → answered with `{t:'greeters', list, founded, admitted}` (the sealed registry; founding is by arrival order) |
| mesh → relay | `{t:'peer', to, msg}` | sealed first-contact signaling, routed to one peer as `{t:'peer', from, msg}`; a target with no socket bounces `{t:'nosock', to}` to the sender |
| mesh → relay | `setpw` / `ban` / `unban` / `votekick` / `banlist` | the door verbs; in admin rooms each order carries `{sp, sig, pub}` — an Ed25519 signature the relay verifies exactly as any peer would (docs/meet-security.md §SIG) |
| relay → all | `{t:'roster', peers:[…]}` / `{t:'peer-leave', peer}` | membership (opaque ids only) |
| relay → one | `{t:'joined'}` / `{t:'whoami', ip}` / `{t:'pw', …}` / `{t:'error'}` | lifecycle |

A brand-new joiner still needs only the share link: they knock, decrypt a
greeter's sealed address, and everything after that — including the App GIF,
which crosses the room's own mesh from whichever peer holds it — happens over
WebRTC, not the relay.

**The relay only ever carries ciphertext and derivations.** Clients follow a
"derive, don't send" scheme (`site/js/gifos-net.js`): the session id in the
path and the `token`/`pw` query params are SHA-256 derivations of the link
secret (and password), compared for equality server-side; the content of every
routed frame (`msg` payloads) is AES-GCM sealed with a key derived from the
same secret and never sent. The relay's routing and gating code is unchanged —
it just knows strictly less.

## Session identity & the door

The session id in the URL (`/s/<sid>`) carries its own ownership rule, read by
one helper — `verifierOf(sid)`: the `[a-f0-9]{16,64}` tail after the **last dot**,
or empty if there is none. Apps and meetings use it identically, so there is no
`?av=` (or any other) authority parameter — the verifier only ever travels inside
the id.

- **Dotless id → a plain room.** No admin can ever exist. Occupancy is the only
  memory: the first arriver at an empty room re-establishes the token and any
  password from their own derivation, and everyone after them must match. Bad
  actors are handled by `votekick` — a live majority of occupants' personal
  vote-off lists, tallied per connection, with no stored ban list to inject into.
- **`<room>.<verifier>` → an admin room.** Authority is a **signature, never a
  socket** (docs/meet-security.md §SIG): the admin password seeds an Ed25519
  keypair, the verifier is a hash commitment to its public key, and every
  privileged order (`setpw`, `ban`/`unban`, `banlist`) arrives individually
  signed as `{sp, sig, pub}` with a 5-minute freshness window. The relay checks
  the same proof any peer checks and stamps nothing. The password itself never
  reaches the relay and never appears in any link.

The relay **stores none of this** — the verifier is recomputed from the id and the
proof is checked per connection, so nothing about ownership persists server-side.

## Local testing

`test/servers/relay-local.js` is a dependency-free Node server that speaks the
same protocol, used by most of the browser suites (e.g. `e2e-knock-first.js`,
`e2e-pipe-mesh.js`). It is **not** for production — deploy the Worker for real
use.
