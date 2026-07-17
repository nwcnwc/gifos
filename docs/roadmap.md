# GifOS roadmap

Planned work that isn't built yet. Each item says **what**, **why it fits**, a
**sketch** of the approach, and the **open questions** still to settle. Nothing
here is committed to a release; it's the shortlist we've agreed is worth doing.

Guiding constraint: everything must survive GifOS's two non-negotiables — **no
accounts** and **no server that sees plaintext** (the relay is a zero-knowledge
greeter; healing-laws R2). A feature that needs a login or a trusted server is
the wrong shape until it's reworked to fit.

---

## 1. Paid TURN relay tier (media over UDP-blocked / symmetric-NAT networks)

**What.** Offer a TURN relay as an opt-in **paid add-on** so audio/video
survives the networks where the mesh can't reach directly. Today `ICE_SERVERS`
(`site/js/gifos-net.js`) is **STUN-only, no TURN** — by design: *"Media gets a
friend or nothing."* Data/control degrades to a friend-hop (`fmesh`/`fsig`) and
then the ws relay, but two peers who are both behind symmetric NAT or on a
UDP-blocked network (common on corporate / school / hospital WiFi) and share no
mutual forwarder simply can't connect media. TURN is the missing rescue.

**Why it fits.** TURN is the *only* piece of the stack with a real marginal
cost (relayed bandwidth). STUN, the ws control relay, and the P2P mesh are
nearly free. Charging only for the relay aligns cost with revenue and keeps the
default experience free and account-free. One paying **host** offering a
`turns:` candidate can rescue connectivity for a whole pair (ICE uses a relay
candidate offered by *either* side), which matches the host/admin-room model —
"the host upgrades the room, guests just benefit."

**Sketch.**
- Stand up (or resell) a TURN server on `turns:…:443` — TURN-over-TLS on the
  HTTPS port so it passes DPI firewalls. **Cloudflare Realtime** (managed TURN,
  pay-as-you-go, cheap egress) is the low-ops path and fits the existing stack
  (we already point STUN at `stun.cloudflare.com` and run a Cloudflare Worker
  for the mirror). Self-hosted **coturn** is the alternative for full control.
- **Ephemeral credentials only.** Never ship a static TURN username/password —
  it would be scraped and used for free. A tiny Worker endpoint mints short-TTL
  HMAC creds (coturn `use-auth-secret` / TURN REST API, RFC 7635) for a holder
  of a valid entitlement.
- Client change in `gifos-net.js`: when the user holds an entitlement token,
  fetch creds and append the `turns:` entry to `ICE_SERVERS` before building the
  `RTCPeerConnection`; with no token, fall straight back to today's STUN-only
  behaviour (zero regression).

**Open questions.**
- **Privacy honesty.** TURN relays DTLS/SRTP *ciphertext* (operator can't see
  media — consistent with R2), but it *must* see both peers' IP addresses to
  relay. That's more than the ws relay learns today. Say so plainly in the
  product copy.
- **Keep it account-free.** Payment introduces a customer identity. Decouple it:
  a purchase buys an *opaque* entitlement token that only the TURN-cred Worker
  ever sees — never presented to the relay, never carried into the meeting, never
  tied to the genesis key. Meetings stay account-free; only the credential path
  knows a customer exists.
- Metering/quota per credential for billing; abuse limits on the cred endpoint.
- Payment rail → see item 2 (x402 is the natural fit — a wallet, not an account).

---

## 2. General x402 support (HTTP-native, account-free payments)

**What.** Support the **x402** payment standard across GifOS — the open protocol
built on HTTP `402 Payment Required`: a server answers a request with `402` plus
machine-readable payment requirements, the client pays (typically a stablecoin
like USDC on an L2 such as Base) and retries with an `X-PAYMENT` header, and a
facilitator verifies settlement before the resource is returned. "General
support" means both **consuming** x402 (a GifOS app pays a metered API per
request) and **charging** via x402 (a GifOS service — starting with the TURN
tier — gates access behind a 402).

**Why it fits.** x402 is the most *GifOS-shaped* way to charge for anything:
payment is a **wallet signature, not an account**. No signup, no stored billing
identity, no server that has to remember who you are — exactly the no-accounts
posture the whole system is built on. It turns "paid features" from an
architectural contradiction into a clean, per-use, holder-of-a-key model that
mirrors how the mesh already thinks about identity (an unforgeable key, not a
login).

**Sketch.**
- **Charging side (server):** a facilitator-backed 402 gate. The TURN-cred
  Worker (item 1) is the first customer — answer `402` with the price, verify the
  `X-PAYMENT` settlement, then mint the ephemeral TURN creds. Same pattern
  generalises to any future metered GifOS service.
- **Consuming side (apps):** a small runtime shim so an App GIF can call an
  x402-gated endpoint — on a `402`, surface the payment requirement to the user,
  pay from their connected wallet, retry with the header. Must run inside the
  app sandbox's existing network-permission model (`runtime.js`), so a paid call
  is still subject to the same allow-list and consent as any other fetch.
- Wallet connection is client-side and user-held; GifOS custodies nothing.

**Open questions.**
- **Sandbox + permissions.** How an x402 payment prompt composes with the app
  permission model and the "apps can't call the GifOS origin" rule — payment
  endpoints are third-party by definition, so this should slot into the existing
  network allow-list, but the UX of a per-request charge inside a sandboxed app
  needs design (consent, spend caps, no silent draining).
- **Chain / asset / facilitator** choice (Base + USDC is the common default) and
  whether to run our own facilitator or use a hosted one.
- **No-custody guarantee.** Keep GifOS entirely out of the money path — it
  brokers a 402 and verifies a receipt; it never holds funds or keys.
- Relationship to item 1: TURN is the pilot service; prove the charging half of
  x402 there before generalising to app-to-app metered calls.
