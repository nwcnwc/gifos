# Payments — the app asks, the human approves, the OS moves the money

**Status: Phase 2 (Base Sepolia testnet only). No mainnet asset is reachable by
this code path.** Ratified 2026-08-11.

The live App Store has a **separate** optional fiat CTA (`site/js/gifos-cash.js`)
— a tip or "feature this listing" button baked from `STRIPE_PAYMENT_LINK` by `scripts/stamp-pay-link.js`. That
is not this x402 path, does not paywall the catalog, and must not be rewritten
into Coinbase/x402.

**Platform decision, Nathan, 2026-08-11: we use Coinbase's stack, or we do no
payments at all.** Base, the Base Account (Coinbase Smart Wallet), and
Coinbase's x402 facilitator. This is not a technical finding, it is a choice
about which ecosystem GifOS lives in, and it settles the chain question that the
rest of this file previously argued from custody alone.

There are TWO directions, and they are different products. Keep them apart.

**A. Apps that SELL — the one we are building.** An app charges its own user:
unlock, per-item purchase, tip, subscription. The money goes to the app's
AUTHOR. See "Apps that sell" below.

**B. Apps that BUY** — an app pays an HTTP resource server for something it
fetched (the x402 protocol). Groundwork exists (`site/js/gifos-x402.js`, the
wire format and its refusals, `test/servers/fake-x402.js`), but it is PARKED:
it is not the capability that was asked for. Nothing in it is wasted — the
wallet, the approval sheet and the ledger are shared with A — and the sections
below on custody and consent apply to both.

Common to both: **every payment is authenticated by a human**, and no app ever
sees a key or a balance. The
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

The consequence is the whole design in one line: **the app asks, the OS asks
the human, and the OS moves the money.** An app that declares `capabilities.pay` and
calls `gifos.fetch('https://…/paid-thing')` gets back either a `200` and the
bytes, or a refusal — and in between, a human authenticated the payment with a
passkey. The app never receives the key, the signature, the address, or the
balance, and cannot pay without a person present. It cannot be tricked into
leaking what it was never given, and cannot spend what it was never allowed to
spend alone.

This is the same shape as the two brokered capabilities that came before:
`gifos.capture` (the OS holds the camera, the app gets bytes) and `gifos.ai`
(the OS holds the provider, the app gets an answer).

## BASE FIRST, via the Base Account — Solana comes after

**Order of work, not a rejection.** Coinbase's stack ships first and completely.
Solana is a nice-to-have AFTER Base is fully supported, and the Solana
groundwork already in the tree stays: `site/js/gifos-pay.js` (base58, address
derivation, integer base units) and `gifos-ed.js`'s `generateSealed()` are
tested, green, and waiting for that phase. Nothing about choosing Coinbase makes
them wrong — they are simply not the current phase.

The custody argument that first pointed at Solana — EVM signs with secp256k1,
WebCrypto has no secp256k1, so a browser EVM wallet must keep raw key bytes that
any XSS steals forever — was correct, **and it is moot here**, because with a
Base Account we are not building a wallet at all.

A **Base Account** is a passkey-owned smart contract account. The key is a
WebAuthn credential in the device's Secure Enclave / TPM, the account verifies
secp256r1 signatures on-chain, and the signing happens in Coinbase's own
account surface — not in GifOS. So:

- **GifOS stores no private key.** Not sealed, not raw, not anywhere. There is
  no key to exfiltrate from the OS page, which is a strictly better posture
  than the sealed-key design this file used to describe.
- **The passkey is hardware-backed and syncs**, so it survives losing this
  browser profile — the single-device failure of the old design is gone.
- **A smart account can pay x402 on the standard path.** USDC's FiatTokenV2_2
  implements ERC-7598, so `transferWithAuthorization` routes the signature to
  the payer contract's EIP-1271 `isValidSignature`. No changes at the merchant
  or facilitator.

What GifOS does instead of custody: it holds a *connection* to the user's Base
Account, builds the payment from the 402 challenge, shows the human what they
are about to pay, and asks the account to sign it.

### Spend Permissions and Sub Accounts — SUPPORTED

Coinbase provides Sub Accounts and **Spend Permissions**: the user signs, once
and with their passkey, a scoped allowance — a cap, an asset, a period, an
expiry, revocable — and an app-scoped Sub Account may then spend inside that
envelope without prompting again. **If Coinbase built it, GifOS supports it.**

This does not weaken the human-authentication rule below, and it is worth being
exact about why. The human still authenticates, cryptographically, with a
hardware-backed passkey; what they authenticate is a **bounded envelope**
rather than each request inside it. Nothing can be spent that a human did not
sign for, the limit is enforced on-chain rather than by our JavaScript, and the
permission can be revoked at any time. That is a stronger guarantee than the
"budget in localStorage" the first draft of this file proposed, precisely
because it is not our code enforcing it.

So GifOS offers both, and the user chooses per app:

- **Ask every time** — no permission granted; each payment raises the account's
  passkey prompt. The default for a newly installed app.
- **Spend Permission** — the user grants a capped, expiring allowance to that
  app's Sub Account, and payments inside it settle without a prompt.

The OS shows amount, asset and recipient before *any* passkey prompt, including
the one that grants a permission — a WebAuthn dialog says only "use your
passkey", so the trusted display of what is being authorised is ours either way.
Granted permissions are listed in Settings with their cap, spend-to-date and
expiry, and a one-click revoke.

## What the OS holds — a connection, not a key

The OS page holds the Base Account connection and the spend ledger. Nothing
secret. The rules that used to protect a key now protect the connection and the
ledger:

- **Nothing payment-related is ever inside a GIF.** App state travels inside the
  app's GIF — a first run with an embedded `.state/db.json` hydrates the icon's
  DB — and sharing a GIF is the whole distribution story. No account address, no
  session, no ledger entry may live in app storage where sharing would leak it.
- `gifos.pay` exposes **no** signing primitive to the sandbox. The only thing an
  app can cause is a payment the human then authenticates.
- The Base Account SDK runs **only on the OS page**, never in an app frame, and
  is vendored and hash-pinned like `js/vendor/nacl-fast.js` — no CDN at runtime,
  consistent with the rest of the site.

**The dependency is accepted deliberately.** Payments now require Coinbase's
account service to be reachable and working. If it is down, GifOS does no
payments — which is the stated preference over building our own custody.

## Apps that sell — `gifos.charge()`

An app asks for money; the OS asks the human; the money goes to the author. The
app is never told the payer's address, never handles funds, and cannot move
money on its own.

### The payee lives in the SIGNED payload, or there is no payment

The payout address is a field in `manifest.json`. That matters because app GIFs
are **shared, downloaded and remixed** — that is the whole distribution model —
so an address sitting in a file anyone can edit is an invitation to redirect
another developer's revenue.

`gifos-sign.js` already solves this. Its canonical hash covers the app's files
(including `manifest.json`) and EXCLUDES the signature block and `.state/**`,
so saving app state never voids a signature but changing the payout address
does. Its verdicts are honest: **signed / unsigned / TAMPERED**. Therefore:

- **An app may charge only when it verifies as `signed`.** `unsigned` and
  `TAMPERED` cannot charge at all — not with a warning, not with a scary
  colour. Refused.
- The approval sheet names the **verified identity**, not a hex string: "paying
  **nathan@example.com** (verified)". Signing identity is a domain (key at
  `https://<domain>/gifos.key`) or an email (public keyserver), so "signed by
  X" is exactly as strong as controlling X.
- **Remixing a paid app does not inherit its revenue.** Editing anything breaks
  the signature, so the remix cannot charge until the remixer signs it with
  their own identity and their own address. That is the correct outcome, and it
  falls out of the existing design rather than needing a new rule.

### Entitlements are held by the OS, never by the app

The same trap as the key, in a new coat: **app state travels inside the GIF.**
If an app recorded "this user bought the pro unlock" in its own `gifos.db`,
then sharing that GIF would hand the purchase to everyone who received it.

So what was bought is recorded by the **OS**, per computer, keyed by
`(appId, sku)`, excluded from GIF export exactly like the asset cache. The app
asks, it does not remember:

```js
await gifos.entitled('pro')        // -> true | false        (OS-held)
await gifos.charge({ sku: 'pro', amount: '2000000',
                     reason: 'Unlock the full app' })        // -> receipt
```

An app that wants to keep its own copy for convenience may, but the OS's answer
is the authority, and the OS's copy is the one that does not travel.

### The four shapes, and how they map

| what the app wants | how |
|---|---|
| one-off unlock | `charge({sku, amount})`, then `entitled(sku)` forever on this computer |
| per-item purchase | the same call with a different `sku`, one approval each |
| tip / pay what you want | `charge({amount: suggested, editable: true})`, no `sku`, no entitlement |
| subscription | a **Spend Permission** scoped to the app's payee address, with a cap and an expiry, plus a renewal charge inside it |

The first three are one primitive and ship together. **Subscriptions are
deliberately last**: recurring money is the only one of the four where a user
can be charged without being present, so it needs the Spend Permission path,
a visible "what you are agreeing to" sheet, and a cancel that works from
Settings — and nothing on-chain cancels it for you when a user simply walks
away.

### What the app never gets

No key, no balance, no payer address, no ability to charge without an approval,
and no way to raise its own ceiling. A charge the human declines returns a
refusal the app must handle — declining is a normal outcome, not an error.

## Consent — nothing spends without a human passkey signature behind it

**Ratified 2026-08-11 by Nathan, overriding the first draft of this file.**
No payment happens that a human did not authenticate with a passkey. Either the
human authenticates *that payment*, or they previously signed a **Spend
Permission** that bounds it — a capped, expiring, on-chain, revocable envelope
(above). What is dead is the first draft's model: an unsigned "budget" in our
own storage, enforced by our own JavaScript, spending while nobody is looking.
If a use case needs spending with no human signature anywhere in its chain of
authority, it does not ship.

The first draft got this wrong, and the way it got it wrong is worth recording
so it is not re-derived. It copied x402's "agentic payments" framing —
machine-to-machine, silent, sub-cap — from the protocol's marketing, *after*
our own research had already established that framing is mostly fiction: about
85% of x402 settlements are operators paying themselves, and the one genuine
demand spike (PING) was **humans** clicking a mint button. Designing for an
absent human was both unsafe and a solution to a problem nobody has.

What replaces it:

- `capabilities.pay` in the manifest, named plainly in the acknowledgement
  sheet like every other capability;
- **a WebAuthn (passkey) signature behind every spend** — either per payment, or
  the Spend Permission that authorised it. Hardware-backed on any modern device
  (Secure Enclave / TPM / Android Keystore), so it is a real biometric or PIN,
  not a checkbox that gets clicked through;
- the OS's own sheet shows **amount, asset and recipient BEFORE the prompt**.
  This matters: a WebAuthn prompt says only "use your passkey", it does not
  display what is being paid. Authentication is not comprehension. The trusted
  display is ours, and it must be correct or the gesture is theatre;
- a per-app and per-call **ceiling** still exists as a hard limit on what may be
  approved for that app, and for permissioned apps it is the cap the human
  actually signed;
- every payment lands in a spend ledger in Settings, per app, with revoke.

**Providers may not pay at all.** A provider runs in a hidden mount with no
visible window, so there is no surface on which to show a human what they are
approving. Refused mechanically, alongside `capabilities.network` and
`capabilities.api`.

### Where the gesture is enforced — pick deliberately

Two levels, and the difference is whether an attacker who owns the page can
skip the human:

1. **Local gate (weaker).** The sealed Ed25519 key stays the on-chain
   authority; the OS demands a WebAuthn assertion, bound to a challenge that is
   the hash of the exact transaction, before it will sign. Honest code cannot
   pay without a human. **But enforcement is our own JavaScript**, so an XSS in
   the OS page can simply call the signer and skip the check. The gesture is a
   policy, not a proof.
2. **On-chain (stronger).** The passkey itself is the spending authority,
   verified by Solana's **secp256r1 precompile (SIMD-0075, Implemented)** —
   which is why this is possible on Solana without an ERC-4337 stack. A payment
   is invalid on-chain unless it carries a fresh passkey signature, so a
   compromised page **cannot** move funds at all. The cost is a wallet
   *program*: the precompile verifies a signature, it does not by itself make a
   passkey the owner of a token account, so funds must sit under a program that
   checks it.

Level 2 is what "every transaction requires human authentication" actually
means when written down honestly. Level 1 only achieves it against bugs and
badly-behaved apps, not against an attacker who reaches the OS page.

## What this does NOT do

- **No mainnet.** Phase 2 is Base Sepolia only and the chain is pinned in
  code, not configurable by an app or a manifest.
- **No arbitrary signing.** There is no "sign this message" primitive. The only
  signable object is a transaction the OS itself constructed from a 402
  challenge and re-inspected after building.
- **No refunds, and no pretending otherwise.** Payments are final. Ask-every-time
  apps cannot burn value in a retry loop, because each attempt stops at a
  gesture; a permissioned app CAN burn up to its signed cap, which is the real
  cost of frictionless mode and why the cap and expiry are the safety and must
  be shown plainly when granting.
- **No swaps, no merchant QR, no Jupiter integration.** Out of scope.
- **No silent spend WITHOUT a signed permission.** Spend Permissions are
  supported; what is refused is spending with no human signature anywhere in
  the chain of authority.
- **No key handling of any kind** — there is no key here to import or export.

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

Three tiers, spelled out in [payments-testing.md](payments-testing.md): pure
unit, a hermetic browser gate, and a deliberate human-run pass on Base Sepolia
using Coinbase's own faucet and facilitator. Only the first two may run in the
gate.

Real money must never be required to run the gate. `test/servers/fake-x402.js`
plays both the resource server (issues a 402, verifies the payment header,
serves the content) and the sponsor (checks the client signature). The suite
runs hermetically with no network and no funds, in the same spirit as the
providers suite, which blocks all off-origin traffic.
