# GifOS roadmap

Planned work that isn't built yet. Each item says **what**, **why it fits**, a
**sketch** of the approach, and the **open questions** still to settle. Nothing
here is committed to a release; it's the shortlist we've agreed is worth doing.

Guiding constraint: everything must survive GifOS's two non-negotiables — **no
accounts** and **no server that sees plaintext** (the relay is a zero-knowledge
greeter; healing-laws R2). A feature that needs a login or a trusted server is
the wrong shape until it's reworked to fit.

---

## 1. (removed) TURN relay tier

A paid TURN tier was sketched here and REJECTED: TURN is a media relay
SERVER, and GifOS media goes peer-to-peer, never through a server — the
meeting footer's promise and the design's non-negotiable. The connectivity
answer for hard NATs stays within the rules: the P1 friend-relay (media
through a MUTUAL FRIEND's browser) and better ICE, not a server.

## 2. General x402 support (HTTP-native, account-free payments)

**What.** Support the **x402** payment standard across GifOS — the open protocol
built on HTTP `402 Payment Required`: a server answers a request with `402` plus
machine-readable payment requirements, the client pays (typically a stablecoin
like USDC on an L2 such as Base) and retries with an `X-PAYMENT` header, and a
facilitator verifies settlement before the resource is returned. "General
support" means both **consuming** x402 (a GifOS app pays a metered API per
request) and **charging** via x402 (a GifOS service).

**Why it fits.** x402 is the most *GifOS-shaped* way to charge for anything:
payment is a **wallet signature, not an account**. No signup, no stored billing
identity, no server that has to remember who you are — exactly the no-accounts
posture the whole system is built on. It turns "paid features" from an
architectural contradiction into a clean, per-use, holder-of-a-key model that
mirrors how the mesh already thinks about identity (an unforgeable key, not a
login).

**Sketch.**
- **Charging side (server):** a facilitator-backed 402 gate. A metered-service cred
  Worker (item 1) is the first customer — answer `402` with the price, verify the
  `X-PAYMENT` settlement, then mint the ephemeral service credential. Same pattern
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
- (item 1 was rejected; the first pilot service is TBD — any metered GifOS endpoint fits this pattern.)
  x402 there before generalising to app-to-app metered calls.
