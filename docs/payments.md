# Payments — the OS pays, the app never holds a key

**Status: Phase 2 (Solana devnet only). No mainnet asset is reachable by this
code path.** Ratified 2026-08-11.

GifOS apps can buy things — an API call, an article, a model download — without
ever seeing a private key, a balance, or even knowing a payment happened. The
mechanism is [x402](https://www.x402.org/): the resource server answers a plain
HTTP request with `402 Payment Required` and a challenge, the payer signs, and
the request is retried. This document is the doctrine; `site/js/gifos-pay.js`
is the implementation.

## Why this fits GifOS at all

`gifos.fetch` was **already brokered**: an app does not fetch, it RPCs the OS,
which performs the request and returns `{status, headers, bytes}`. So a 402
response *already crosses into trusted first-party code*. Payment therefore
belongs exactly where the network capability already lives — in the broker —
and not in the sandbox.

The consequence is the whole design in one line: **the app fetches, the OS
pays.** An app that declares `capabilities.pay` and calls
`gifos.fetch('https://…/paid-thing')` gets back a `200` and the bytes. It never
receives the key, the signature, the address, or the balance. It cannot be
tricked into leaking what it was never given.

This is the same shape as the two brokered capabilities that came before:
`gifos.capture` (the OS holds the camera, the app gets bytes) and `gifos.ai`
(the OS holds the provider, the app gets an answer).

## SOLANA, and why not Base — this is a custody decision, not a taste one

x402's largest deployment is Base, and the obvious move was to follow it. We
did not, for one mechanical reason:

| | signing curve | WebCrypto support | what GifOS must store |
|---|---|---|---|
| Base / EVM (EIP-3009) | secp256k1 | **none** | raw private key bytes |
| Solana (`exact` SVM) | **Ed25519** | yes, incl. `extractable: false` | a handle that cannot be read |

WebCrypto has no secp256k1 and never has. An EVM wallet in a browser therefore
keeps its key as raw bytes in IndexedDB, where any XSS in the OS page can
exfiltrate it and drain every account it controls, forever. On Solana the key
is a **non-extractable `CryptoKey`**: the page can ask it to sign, and cannot
read it — a compromise becomes a bounded signing oracle for as long as the
attacker holds the page, not a permanent theft of the key.

GifOS already depends on WebCrypto Ed25519 (it is mandatory at every mesh join
and sets the browser floor — Chrome 137 / Firefox 129 / Safari 17), so this
adds no new platform requirement.

The Solana `exact` scheme also happens to need *less* from us: the client
builds a transaction, signs it, and hands over a **partially signed**
transaction; the sponsor adds the `feePayer` signature and pays the network
fee. The payer needs **no SOL** and never touches an RPC node to broadcast.
What GifOS must produce is exactly one Ed25519 signature over a message it
fully inspected first.

## What the OS holds, and where it must never go

One keypair per computer, generated on first use, stored in IndexedDB as a
non-extractable `CryptoKey`.

**It is never inside a GIF.** This is the rule everything else protects.
GifOS app state travels *inside the app's GIF* — a first run with an embedded
`.state/db.json` hydrates the icon's DB — and sharing or exporting a GIF is the
entire distribution story. A wallet app that kept its key in `gifos.db` would
hand that key to everyone it was ever shared with. So:

- the key is OS-level, not app-level: no app, provider, or GIF can reach it;
- it is excluded from backup, restore, and whole-computer export, exactly like
  the install-time asset cache;
- `gifos.pay` exposes **no** export, no `getPrivateKey`, no raw-sign primitive.
  The only thing an app can cause is a payment inside its budget.

The honest cost: **non-extractable means the KEY cannot be moved or backed
up** — no seed phrase, no import, no copy to a second device. Be precise about
what that does and does not mean, because the first draft of this file
overstated it: **the funds are not trapped.** The key can always sign a
transfer, so the balance can be swept anywhere at any time, including to
another device's address. What is lost if the browser profile is lost is the
key itself, and with it any balance still sitting in that account at that
moment. This is a transit account you top up, not a savings account, and the
UI says so in those words.

**Prior art we should steal from, not ignore.** Coinbase's answer to the same
problem is better on two axes: their Smart Wallet is an ERC-4337 contract
account owned by **passkeys** (secp256r1, verified on-chain via webauthn-sol),
so the key is hardware-backed in a Secure Enclave/TPM rather than merely
browser-held, and passkeys SYNC, which removes the single-device failure above
entirely. Smart accounts can pay x402 on the standard path — USDC's
FiatTokenV2_2 implements ERC-7598, routing the signature to the payer's
EIP-1271 `isValidSignature`, so `transferWithAuthorization` is not EOA-only.

We do not adopt it wholesale for two reasons: ERC-4337 needs an EntryPoint, a
bundler and a paymaster, none of which a static site on GitHub Pages has or can
host; and a passkey demands a **user gesture per signature**, which is fatal to
silent sub-cap micropayments — the entire point of the budget model above.

What we DO adopt: a passkey (WebAuthn) gate on the consequential actions —
raising a budget, and any single payment above the per-call cap — so the moves
that can actually hurt require a user-present, phishing-resistant confirmation,
while small payments stay silent under the sealed key. (Note `gifos-sign.js` generates *identity* keys with
`extractable: true` — right for identity, which must be portable; wrong for
money, which must not be.)

## Consent — a budget, not a prompt per payment

A confirmation dialog per micropayment defeats the point of micropayments, and
users click through repeated prompts anyway. So consent is granted as a
**budget**, in advance, per app:

- `capabilities.pay` in the manifest, named plainly in the acknowledgement
  sheet like every other capability;
- the user sets a **per-app budget** and a **per-call cap**; both default to
  zero, so a freshly installed app can spend nothing until the user says so;
- under the per-call cap, payment is automatic and silent — that is the point;
- over it, the OS shows a sheet naming the amount, the asset and the recipient;
- every payment is written to a spend ledger visible in Settings, per app, with
  a one-click revoke.

**Providers may not pay.** A provider runs in a hidden mount with no visible
window; a background thing that can spend money is the wrong shape for the same
reason a background thing that can hear you is. `capabilities.pay` is refused
in a provider mount mechanically, alongside the existing refusals of
`capabilities.network` and `capabilities.api`.

## What this does NOT do

- **No mainnet.** Phase 2 is devnet-only and the network is pinned in code, not
  configurable by an app or a manifest.
- **No arbitrary signing.** There is no "sign this message" primitive. The only
  signable object is a transaction the OS itself constructed from a 402
  challenge and re-inspected after building.
- **No refunds, and no pretending otherwise.** Payments are final. A buggy app
  in a retry loop spends real value up to its budget — the cap is the only
  defence, which is why the cap is mandatory and defaults to zero.
- **No swaps, no merchant QR, no Jupiter integration.** Those need a real
  wallet with SOL, an RPC path and probably an external wallet rather than an
  in-OS key. Deliberately out of scope.
- **No key import/export**, per above.

## Threat model, stated plainly

1. **Malicious app.** Bounded by the per-app budget and per-call cap. It cannot
   read the key, cannot sign anything but a broker-built payment, and cannot
   raise its own budget.
2. **XSS in the OS page.** The serious one. The attacker becomes a signing
   oracle while they hold the page and can drain the account's balance — but
   cannot steal the key itself, so the damage stops when the page closes and
   is bounded by what is in the account. Keep the balance small; this is why
   the "transit account" framing is a security control, not marketing.
3. **Hostile facilitator/sponsor.** It sees the transaction, adds the fee
   signature and submits. It cannot alter the payment: the client signature
   covers the instructions. It *can* refuse to submit, or censor — the failure
   mode is a request that does not complete, not a payment that goes astray.
4. **Hostile resource server.** It can quote any price it likes. The per-call
   cap is what stops "one satoshi" becoming "one thousand dollars"; the
   challenge amount is checked against the cap **before** anything is signed.

## Testing

Real money must never be required to run the gate. `test/servers/fake-x402.js`
plays both the resource server (issues a 402, verifies the payment header,
serves the content) and the sponsor (checks the client signature). The suite
runs hermetically with no network and no funds, in the same spirit as the
providers suite, which blocks all off-origin traffic.
