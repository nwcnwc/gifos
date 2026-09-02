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
| The GifOS first-party origin(s) | `gifos.app`, `relay.gifos.app`, `cors-proxy.gifos.app`, the mirror computers (`0–9` and the named subdomains in `mirror/wrangler.toml`) | A malicious app must not use us as a proxy or reach our own services |
| Provenance private keys | The signer's own machine — **never** in client JS, the repo, GitHub Actions secrets, Workers, or any AI channel | If a signing key leaks, authorship claims become forgeable |
| The relay | A stateless Cloudflare Worker | It must stay a dumb, cheap pipe — no data at rest, no media |
| Live media | Camera/mic in video calls | Media must stay peer-to-peer and consented; it must never transit our servers |

---

## 3. Trust boundaries

```
 ┌─────────────────────────────────────────────────────────────┐
 │ TRUSTED: the GifOS shell (index.html / run.html / runtime.js)│
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
                ▼ (greeter + door)               ▼ (multiplayer owner/guest)
        ┌──────────────────┐            ┌────────────────────────┐
        │ relay Worker      │            │ another person's browser│
        │ persists NOTHING  │            │ (owner-signed state is  │
        └──────────────────┘            │  authoritative)         │
                                        └────────────────────────┘

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
  `capabilities.links` is the one declared extra: `allow-popups` plus
  `allow-popups-to-escape-sandbox`, so a tap on a link can open a **new**
  ordinary tab. It never adds `allow-top-navigation` or `allow-same-origin`.
- An injected **CSP** is the first child of `<head>` on every app document:
  `default-src 'none'`, `connect-src 'none'` (kills `fetch`/XHR/WebSocket/
  `EventSource`/beacons), no `worker-src` (workers blocked), `frame-src
  'none'`, `object-src 'none'`, `base-uri about:` (only `about:`, so the OS
  can pin the app's base to `about:srcdoc` — `'none'` would block the OS's own
  `<base>`). Scripts/styles are `'unsafe-inline'` only because the app *is*
  inline; `img/media/font` allow `data:`/`blob:` so bundled assets render,
  with no network reach. One declared relaxation: `capabilities.wasm` opens
  the wasm hatch — `'wasm-unsafe-eval'`, `worker-src blob:`, `connect-src
  blob: data:` — still nothing that reaches the network.
- `RTCPeerConnection`/`RTCDataChannel` constructors are **hard-deleted** in the
  client shim before app code runs (CSP's `webrtc` directive isn't portable).
- The **postMessage bridge validates `e.source === iframe.contentWindow`** and a
  namespace tag, and exposes a **fixed op set** only (`db`, `fetch`, `save`,
  `capture` (camera/mic, capability-gated), `libraryPut`/`libraryOpen` (hand a
  finished photo/clip to My Media, and jump there), `ai`/`api`/`agentChat`
  (brokered, capability-gated), `asset`, `launch`, `info`, `me`, `setName`,
  `storage`). There is no op to change capabilities or to read another icon's
  data.
- App DB access is **namespaced by the icon's `fileId`**, hard-wired in the
  runtime — `gifos.db(name)` names a collection *within the calling app's own
  partition*; the bridge message carries no `fileId`, so reading another app's
  data is structurally impossible (this is why there's no `capabilities.db`
  gate). The one deliberate outward write is `libraryPut`, which files a
  finished photo/clip into My Media's partition — append-only, into one known
  app.
- DB writes are rebuilt on a **null-prototype object** with `__proto__`/
  `constructor`/`prototype` dropped — a stored value can't reach `Object`'s
  prototype (prototype-pollution guard).

**Residual risk:** an app can still be annoying inside its own box (spin the CPU,
fill its own state up to the origin quota). It cannot reach out of the box.

### Boundary B — the network bridge (`gifos.fetch`)

**Threat:** an app exfiltrates data to an arbitrary server; proxies through the
trusted GifOS origin; SSRFs internal services via a redirect.

**Mitigations**
- The bridge is the **only** egress, and every path through it is
  **manifest-gated**: `gifos.fetch` reaches only hosts declared in
  `capabilities.network`, and the brokered `gifos.ai` / `gifos.api` calls
  (their own capabilities, their own acknowledgement lines) reach only the
  user's configured provider or named API. A GIF that declares none of these
  has no path to the internet — and note an app WITH `capabilities.ai` can
  ship what it hands the model off-device via the user's provider, which is
  why `ai`/`api` are named in the acknowledgement sheet like network hosts.
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
- `inflate()` **streams with a ceiling** and aborts past it. The bomb is a
  small payload that expands: the cap is `max(64 MB, 16 × compressed size)`,
  hard-capped at 2 GB−1. A large App GIF the person already downloaded is
  allowed to unpack in proportion to its size; a kilobyte zip-bomb is not.
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
- For MEETINGS the relay is additionally a **zero-knowledge greeter registry**
  (docs/healing-laws.md R2/R3): per room it holds only `H(genesis key)` and
  TTL'd greeter addresses **sealed under the room key it does not hold**
  (`Seal(K, addr)`, K = derive(url, pw) — docs/meet-security.md §LOCK). A
  relay-state dump yields a hash and ciphertext — no membership, no seats, no
  identities. It gates only GENESIS (empty registry ⇒ first knocker founds;
  the DO's single thread serialises it) and arbitrates nothing else.

**Residual risk:** metering is in-memory, so a determined client can regain a
burst bucket across reconnects. Accepted for now — the socket/join caps bound it,
and we add zero persistence by design. Revisit with a per-IP cooldown if abuse
appears.

### Boundary E — multiplayer peers

**Threat:** a client corrupts a host's app state; a host serves a hostile app to
clients; a lost reply causes duplicate writes on reconnect.

**Mitigations**
- The **owner is authoritative**: app state rides the room's own mesh as
  owner-SIGNED frames (`site/js/app-owner.js`); peers verify the signature
  before applying. There is no relay app-session at all any more — the relay
  is a greeter + door, and a socket claiming any role but `mesh` is refused
  (one-runtime flag day; `relay/src/relay.js`).
- **Authority is a signature, never a socket** (docs/meet-security.md §SIG).
  In a `"<room>.<verifier>"` room the verifier is a hash commitment to an
  Ed25519 PUBLIC key; every privileged order arrives individually signed as
  `{sp, sig, pub}` and the relay verifies the same proof any peer verifies —
  commitment, signature, right action, fresh timestamp. No secret query
  param, no admin sockets, no stamps. So a link-holder can join and read the
  shared state, but cannot impersonate the owner or serve poisoned state
  under their name. The relay derives the verifier from the id with one
  helper (`verifierOf`) shared with meetings, so apps and meetings
  authenticate authority identically. A creator who instead picks "Let a
  friend keep it going" mints a *resilient* room, where succession is
  deterministic (lowest present peer id adopts from its verified mirror) —
  see the residual note.
- **Replay is idempotent**: the host remembers each peer's recent `put` op-ids and
  resends the prior reply instead of re-applying, so a reconnect can't mint a
  duplicate record.
- **The relay is honest-but-curious-proof for content.** Clients derive the
  session id, join token, and password proof from the link secret by SHA-256
  (a room PASSWORD is first stretched with PBKDF2-SHA256, 310k iterations,
  room-salted — `gifos-net.js` `stretchPw` — so a proof or a ciphertext is not
  an offline dictionary attack at hash speed)
  ("derive, don't send" — `site/js/gifos-net.js`) and seal every content frame
  with an AES-GCM key derived from the same secret, so a logging or subpoenaed
  relay holds only routing metadata and ciphertext. This does **not** defend
  against an *actively malicious* relay (which could MITM WebRTC signaling
  regardless); the link itself remains the capability — anyone who ever held it
  can derive the key, and bans/rotation do not re-key (rotating the LINK does:
  a new link is a new secret and a new key).
- **The meeting roster is sealed FROM the relay: only members can read who's on
  the call.** Every participant knows the meeting URL; the relay does not (it
  sees only hashes of it — "derive, don't send"). So identity — display **name**
  AND **network address** — never rides the relay-authored roster. Both travel
  end-to-end **AES-GCM-sealed** under the meeting-URL key, in the heartbeat and
  offers/answers, and the relay routes only opaque ephemeral peer ids. A relay
  state dump, log, or on-path eavesdropper who is not in the room sees ciphertext,
  not a directory of who is present. Even a client that puts `?name=` on its URL
  is ignored. **The IP subtlety:** the relay *terminates* each WebSocket, so it
  transiently observes the source `CF-Connecting-IP` (accepted — Cloudflare logs
  it at the transport layer regardless). But it never *stores* it readable: it
  hands each socket its own address once (`whoami`), and the client seals that
  into the roster for peers; the only IP the relay *persists*, in the socket
  attachment, is a **salted hash** used solely for per-IP abuse caps by equality.
  Media endpoints (ICE candidates) already travel inside the sealed signaling.
- **Device tags are room-salted, so the relay cannot correlate a device across
  rooms.** The relay needs a stable per-room token to enforce bans and vote-offs
  by equality, but the client only ever sends a hash of its device id salted with
  the room — a per-room opaque value, never the raw cross-room id and never
  reversible to a person. The cost is deliberate: because a determined device can
  simply wipe its id and mint a new one, device bans/vote-offs were only ever a
  soft tool against honest repeat offenders, so binding the relay's *tag* per-room
  (rather than handing the relay a global correlator for every honest user) is the
  right trade. The user's **personal vote-off list is still global** — it lives
  client-side as raw device ids (`localStorage.gifos_voteoff`, "anywhere, ever")
  and is **re-salted with the current room** each time it is applied, so a vote
  follows the person into every meeting *without* the relay ever holding a
  cross-room identifier. Globalness lives in the client; per-room opacity lives at
  the relay.
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
- **Metadata visible to the relay operator.** Content is not: every frame the
  relay carries is AES-256-GCM ciphertext under a key derived from the link
  secret, which the relay never sees ("derive, don't send",
  `site/js/gifos-net.js`), it **stores none of it**, and **media never transits
  it**. What the operator *can* still observe is metadata — IP addresses,
  session ids (derived, but linkable per room), timing, and frame sizes. If
  that exposure matters, it is not defended against here.
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
