# GifOS Threat Model

This document says what GifOS defends against, how, and — just as importantly —
what it deliberately does **not** try to defend against. It's the "why" behind
the sandbox, the fetch bridge, the relay limits, and the provenance signatures,
so contributors don't accidentally weaken a boundary that exists on purpose.

It complements [`architecture.md`](./architecture.md) (how the system is built)
and [`cors-and-networking.md`](./cors-and-networking.md) (how egress works).

---

## 1. The one-paragraph summary

GifOS runs **untrusted app GIFs** — anyone can make one and share it — inside a
browser, next to a user's local data and their real camera/mic. The central
security bet is that an app GIF is treated like a **web page from a stranger**:
it runs in a sandboxed, opaque-origin iframe with no ambient authority, and the
only things it can do to the outside world go through a small, audited bridge
that the user controls. Everything else — persistence, networking, WebRTC,
workers — is denied by default and granted narrowly.

---

## 2. Assets we protect

| Asset | Where it lives | Why it matters |
|---|---|---|
| The user's local computer | IndexedDB (`gifos` DB): files, per-app state, desktop layout | It's everything the user owns; there is no server copy |
| The user's device | The browser/OS running GifOS | An app must not pivot from "runs in a tab" to "attacks the machine" |
| The GifOS first-party origin(s) | `gifos.app`, `relay.gifos.app`, `cors-proxy.gifos.app`, `0–9.gifos.app` | A malicious app must not use us as a proxy or reach our own services |
| Provenance private keys | The signer's own machine — **never** in client JS, the repo, Workers, or any AI channel | If a signing key leaks, authorship claims become forgeable |
| The relay | A stateless Cloudflare Worker | It must stay a dumb, cheap pipe — no data at rest, no media |
| Live media | Camera/mic in video calls | Media must stay peer-to-peer and consented; it must never transit our servers |

---

## 3. Trust boundaries

```
 ┌─────────────────────────────────────────────────────────────┐
 │ TRUSTED: the GifOS shell (index.html / run.html / runtime.js) │
 │  - reads manifests, holds the DB, owns the postMessage bridge │
 │                                                               │
 │   ╭──────────────── boundary A: the sandbox ───────────────╮  │
 │   │ UNTRUSTED: an app GIF, in an opaque-origin iframe       │  │
 │   │   talks out ONLY via postMessage → a fixed op set       │  │
 │   ╰─────────────────────────────────────────────────────────╯  │
 │                                                               │
 │   boundary B: gifos.fetch() — the only network egress         │
 │   boundary C: the GIF decoder — untrusted bytes in            │
 └───────────────┬───────────────────────────────┬──────────────┘
                 │ boundary D: the relay          │ boundary E: a remote peer
                 ▼ (stateless pipe)               ▼ (multiplayer host/client)
        ┌──────────────────┐            ┌────────────────────────┐
        │ relay Worker      │            │ another person's browser│
        │ persists NOTHING  │            │ (host is authoritative) │
        └──────────────────┘            └────────────────────────┘

 boundary F: a booted computer image runs in its own IndexedDB namespace
 boundary G: provenance — a signature claims authorship of GIF bytes
```

---

## 4. Adversaries

- **A malicious app author** — publishes an app GIF that tries to exfiltrate the
  user's data, escape the sandbox, pollute the runtime, DoS the device, or phish
  the user (e.g. by asking for a private key).
- **A malicious multiplayer peer** — a *client* trying to corrupt or poison a
  host's app state, or a *host* serving a hostile app to the clients who join.
- **A relay freeloader / flooder** — someone abusing the relay for bandwidth, to
  exhaust it, or to tunnel media through it.
- **A network / redirect attacker** — trying to turn the fetch bridge into an
  SSRF or same-origin proxy via redirects.
- **A provenance forger** — trying to make a GIF appear signed by someone it
  isn't.

We do **not** model the user's own browser/OS, the device owner themselves, or
the GifOS first-party infrastructure as adversaries (see §7).

---

## 5. Threats and mitigations, by boundary

### Boundary A — the app sandbox

**Threat:** an app reads another app's data, the desktop's data, cookies, or
`localStorage`; reaches the parent DOM; or opens its own network/WebRTC/worker.

**Mitigations**
- App runs in an iframe `sandbox="allow-scripts allow-forms allow-downloads"` —
  **no `allow-same-origin`**, so it has an **opaque (null) origin**. `cookies`,
  `localStorage`, and `IndexedDB` throw; there is nothing to share or collide in.
- An injected **CSP** is the first child of `<head>` on every app document:
  `default-src 'none'`, `connect-src 'none'` (kills `fetch`/XHR/WebSocket/
  `EventSource`/beacons), **no `worker-src`** (workers blocked), `frame-src
  'none'`, `object-src 'none'`, `base-uri 'none'`. Scripts/styles are
  `'unsafe-inline'` only because the app *is* inline; `img/media/font` allow
  `data:`/`blob:` so bundled assets render, with no network reach.
- `RTCPeerConnection`/`RTCDataChannel` constructors are **hard-deleted** in the
  client shim before app code runs (CSP's `webrtc` directive isn't portable).
- The **postMessage bridge validates `e.source === iframe.contentWindow`** and a
  namespace tag, and exposes a **fixed, small op set** only: `db`, `fetch`,
  `save`, `info`, `me`, `setName`, `storage`. There is no op to write files,
  change capabilities, or reach another icon.
- App DB access is **namespaced by the icon's `fileId`**, hard-wired in the
  runtime — `gifos.db(name)` names a collection *within the calling app's own
  partition*; the bridge message carries no `fileId`, so cross-app access is
  structurally impossible (this is why there's no `capabilities.db` gate).
- DB writes are rebuilt on a **null-prototype object** with `__proto__`/
  `constructor`/`prototype` dropped — a stored value can't reach `Object`'s
  prototype (prototype-pollution guard).

**Residual risk:** an app can still be annoying inside its own box (spin the CPU,
fill its own state up to the origin quota). It cannot reach out of the box.

### Boundary B — the network bridge (`gifos.fetch`)

**Threat:** an app exfiltrates data to an arbitrary server; proxies through the
trusted GifOS origin; SSRFs internal services via a redirect.

**Mitigations**
- The bridge is the **only** egress, and it's **manifest-gated**: an app can only
  reach hosts it declares in `capabilities.network`. A self-contained GIF
  declares none and can never touch the internet.
- The user **sees and controls** the list: a plain-language acknowledgement on
  first run (and again only if the app changes the hosts it asks for), a
  per-host revoke checkbox, and an always-available tab chip. `"*"` is allowed
  but flagged **⚠ Unsafe** with an explainer.
- Fail-closed checks: **HTTPS only** (except `localhost` dev); the **first-party
  denylist** refuses `gifos.app`, `*.gifos.app`, the serving origin, and any
  configured `window.GIFOS_FIRST_PARTY` sibling; **`credentials: 'omit'`**; an
  **8 MB response cap**.
- **Redirects are re-validated**: after following, the *final* URL
  (`resp.url`) is re-checked against the denylist and the app's allowlist, so an
  allowed host can't 302 onto a first-party or non-allowed host and hand back a
  readable body.
- Declared hosts are **normalized** (lower-cased, trailing-dot stripped,
  non-ASCII/confusable hosts rejected) so permissions can't be duplicated or
  silently mismatched.

**Residual risk:** a user can still *choose* to approve a wildcard app and let it
talk to a server that then misuses the data. That's an informed-consent
decision, surfaced as loudly as we can (the Unsafe label).

### Boundary C — the GIF decoder (untrusted bytes)

**Threat:** a crafted GIF exhausts memory/CPU on decode (a decompression bomb) or
crashes the parser.

**Mitigations**
- `inflate()` **streams with a 64 MB ceiling** and aborts past it.
- Parsing is defensive: malformed/embedded state is caught and the app starts
  fresh rather than throwing.

**Residual risk:** the browser's own image pipeline handles the raster; we cap
the parts we control. A pathological input degrades to "app won't load," not a
compromise.

### Boundary D — the relay

**Threat:** the relay becomes a data store, a media conduit, or a bandwidth
sink; a client regains burst budget by reconnecting.

**Mitigations**
- The relay **persists nothing** server-side. All per-connection state rides in
  the socket attachment (≤ 2 KB); a Durable Object hibernation loses nothing that
  matters.
- It **never carries media** — a server-enforced **token-bucket** (≈1 MB burst,
  ~384 Kbps sustained) makes tunnelling video through it impractical; live media
  is strictly peer-to-peer.
- Practical abuse guards: **per-IP socket caps, join-rate caps, hard
  message-size caps, and an origin allowlist**.

**Residual risk:** metering is in-memory, so a determined client can regain a
burst bucket across reconnects. Accepted for now — the socket/join caps bound it,
and we add zero persistence by design. Revisit with a per-IP cooldown if abuse
appears.

### Boundary E — multiplayer peers

**Threat:** a client corrupts a host's app state; a host serves a hostile app to
clients; a lost reply causes duplicate writes on reconnect.

**Mitigations**
- The **host is authoritative**: clients forward DB *ops*; the host applies them
  against its own store and broadcasts changes.
- **The host slot is owned, not first-come.** By default an app invite is an
  *owned* link: its session id is `"<room>.<verifier>"`, and the relay only lets a
  socket hold the host slot if it proves a secret (`adm`) whose SHA-256 begins with
  the verifier. That secret is generated by the creator's app, **never shown to a
  human, and never in the link** — the link carries only the verifier. So a
  link-holder can join and read the shared state, but can **never seize the host
  slot to impersonate the owner or serve poisoned state under their name**. The
  relay derives the verifier from the id with one helper (`verifierOf`) shared with
  meetings, so apps and meetings authenticate authority identically. A creator who
  instead picks "Let a friend keep it going" mints a *dotless* (anyone-owns) id,
  where by design any holder may host — see the residual note.
- **Replay is idempotent**: the host remembers each peer's recent `put` op-ids and
  resends the prior reply instead of re-applying, so a reconnect can't mint a
  duplicate record.
- **The relay is honest-but-curious-proof for content.** Clients derive the
  session id, join token, and password proof from the link secret by SHA-256
  ("derive, don't send" — `site/js/gifos-net.js`) and seal every content frame
  with an AES-GCM key derived from the same secret, so a logging or subpoenaed
  relay holds only routing metadata and ciphertext. This does **not** defend
  against an *actively malicious* relay (which could MITM WebRTC signaling
  regardless); the link itself remains the capability — anyone who ever held it
  can derive the key, and bans/rotation do not re-key (rotating the LINK does:
  a new link is a new secret and a new key).
- **Meeting display names never reach the relay.** A participant's name is not a
  relay query param and is not stored in any socket attachment or roster; it
  rides only the AES-GCM-sealed heartbeat (and sealed offers/answers) between
  clients, so the relay routes anonymous peer ids and never authors a
  who's-here-by-name directory. Even a client that puts a `?name=` on its URL is
  ignored. **Network addresses are the exception and cannot be hidden this way:**
  the relay *terminates* each WebSocket, so it observes the source IP inherently
  (`CF-Connecting-IP`) — sealing a field cannot unsee a connection's origin. The
  relay shares those IPs back to room members deliberately (an accountability
  record, since peers exchange them for P2P anyway), not as a leak. Media
  endpoints (ICE candidates) travel inside the sealed signaling and are already
  opaque to the relay.
- A client that joins a hostile app **still crosses boundary A and B** — it runs
  the received app sandboxed and gets the same network acknowledgement — so a
  malicious host can't do more to a client than any other app author could.
- Media between blocked/again pairs is relayed by *peers*, never by the server,
  and video consent/blur is **sender-enforced**.

**Residual risk:** within an app's own data model, a malicious peer can send
semantically bad ops (e.g. a bogus move). Apps that care must validate their own
state — GifOS guarantees isolation and delivery, not app-level correctness. And an
**anyone-owns** link — the self-healing app opt-out, or any plain (non-admin)
meeting room — is *unauthenticated by design*: it has no verifier and no secret, so
whoever holds it may host or join as an equal, and the meeting has no admin. This
is a deliberate, labeled choice, not a gap: the guarantee it forgoes (owner
authenticity) is one no secret carried *inside* a shareable link could keep, and
where authorship matters, GIF **signing** (boundary G) supplies it independently of
who is hosting. Plain meetings lean on peer-enforced civility instead of an owner —
attributed group mute/blur and device-based vote-off lists (see §6).

### Boundary F — booted computer images (VMs)

**Threat:** a nested/booted computer image reads or corrupts the host desktop.

**Mitigation:** a booted image runs against its **own IndexedDB namespace**
(`gifos_vm_<fileId>`) with namespaced broadcast channels; it cannot read, write,
or repaint the host desktop. Each nesting level is just another namespace.

### Boundary G — provenance

**Threat:** a GIF falsely claims to be authored by a trusted domain or person.

**Mitigations**
- Signatures are **domain (Ed25519, key at `https://domain/gifos.key`)** or
  **email (OpenPGP via keyservers)**; verification fetches the public key and
  checks the signed hash. The UI shows **✓ Signed by…**, **Unsigned**, or **⚠
  Tampered**.
- **Private keys never touch client JS, the repo, the Workers, or any AI
  channel** — signing happens on the author's machine.

**Residual risk (by design):** a signature proves **authorship, not safety** — a
signed app can still be malicious — and any signature can be **stripped**. It's
provenance, not a virus scanner. The UI says so.

---

## 6. Identity

There are no accounts. Identity is the **browser profile**: a random `uid` and a
self-chosen **screen name** in `localStorage`. Multiplayer names are
**self-asserted** — a peer can call themselves anything. This is intentional
(zero-friction, no server), and the mitigations for name abuse are social/local:
device-based **vote-off lists**, host/admin **moderation**, and, in video rooms,
**IP transparency** so participants can see who they're actually connected to.

---

## 7. Non-goals (what GifOS does **not** defend against)

Being explicit here prevents false confidence:

- **A compromised device or browser.** If the OS, browser, or a browser
  extension is hostile, it can read the IndexedDB directly. GifOS is a web app,
  not a secure enclave.
- **Confidentiality of local data at rest.** There's no account and no
  encryption-at-rest beyond the browser profile. Anyone with the unlocked device
  and profile sees the same desktop. Keep a backup GIF for durability, not
  secrecy.
- **A compromised GifOS first party.** We *are* the trusted origin. If `gifos.app`
  or the Workers are compromised, the sandbox model doesn't save you — that's a
  deployment/ops concern, not an app-sandbox concern.
- **Confidentiality of app-DB traffic from the relay operator.** Traffic to the
  relay is TLS-encrypted in transit, but the relay *could* observe app ops
  server-side; it simply **stores none of it**, and **media never transits it**.
  When a direct P2P DataChannel is established, that path is DTLS between peers.
  For data you wouldn't want the relay operator to see, rely on the P2P path and
  the trust model accordingly.
- **Safety guarantees from signatures.** See boundary G — authorship ≠ safety.
- **A user's own informed choices.** If a user approves a wildcard-network
  ("Unsafe") app, GifOS honors it. We make the risk loud; we don't override the
  human.
- **Perfect availability under a determined flooder.** The relay caps bound
  abuse; they don't make it a DDoS-proof service.

---

## 8. Reporting

Found something that crosses a boundary this document claims is closed? That's a
real bug — please open an issue (or contact the maintainer privately for anything
sensitive) with the app GIF or reproduction. Boundary A (sandbox escape) and
boundary B (bridge bypass / SSRF) are the highest-severity classes.
