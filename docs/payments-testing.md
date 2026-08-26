# Testing payments — three tiers, and only one of them may run in the gate

Money is the one subsystem where a test that "mostly works" is worse than no
test. This file says exactly how each tier is exercised, what it can and cannot
prove, and which of them is allowed to touch a network. Doctrine is in
[payments.md](payments.md).

The rule that shapes everything below: **the release gate must never need
money, credentials, or a network.** `e2e-providers.js` already had to be forced
back to that standard when a pinned 1 GB asset quietly turned a hermetic suite
into a networked one. Payments will not repeat it.

## Tier 1 — pure unit (no network, no chain, no wallet)

`test/unit/x402-wire.js`, `test/unit/pay-encoding.js` — and, added since:
`charge-gate.js`, `charge-signed-payee.js`, `purse.js`, `cash-link.js`. All
run in the normal unit tier, in Node, in milliseconds.

Proves: the wire format parses; **every refusal fires** (mainnet quote, unknown
token, over-ceiling, no-ceiling, bad scheme, non-address payee, non-integer
amount, future protocol version, and a 2^53+1 amount compared exactly rather
than as a float); base58 and address derivation round-trip against published
vectors and real on-chain addresses; a sealed key signs and refuses export.

Cannot prove: that any of it moves money.

## Tier 2 — hermetic browser gate (still no network, no chain, no money) — BUILT 2026-08-25

`test/browser/e2e-pay.js`, discovered by the browser tier like every suite.
It spawns its own fixtures — `fake-paypal.js` (8795), `pay-local.js` (8796 —
the SAME `pay/src/core.js` the Cloudflare Worker runs, signing receipts with
a throwaway key served at `/test-pubkey`), `fake-facilitator.js` (8797), and
a test catalog (8798) — signs an app in-browser with a fresh domain key, and
walks the whole surface: acknowledgement, sheet, PayPal approval window,
capture, signed receipt verified against the (route-intercepted) site key,
entitlement, ledger, the x402 97/3 two-transfer settle via a stub wallet,
and the refusals (unsigned, double-buy, over-ceiling, decline). 17 checks.

The paragraph below was the spec it was built to; kept for the parts
(hostile quotes on the buying direction) not yet exercised. `test/servers/fake-x402.js` plays a paid
resource server and a sponsor, on Base Sepolia's real identifiers, with flags to
serve deliberately hostile quotes (`?mainnet=1`, `?huge=1`, `?scheme=upto`). A
matching **fake payee + fake wallet** does the same for the selling direction:
the OS's approval sheet, the passkey step and the entitlement store are driven
end to end with a stub signer, so nothing real is spent.

Proves: an app asking to charge produces an approval sheet naming the right
amount and the **verified signing identity**; a decline is handled as a normal
outcome; an `unsigned` or `TAMPERED` app is refused outright; an entitlement
lands in the OS store and is NOT inside the app's GIF when exported; the
off-origin block still holds.

Cannot prove: that a real chain accepts the transaction, or that Coinbase's
facilitator agrees the payment is valid. A stub signer that "verified" a real
signature would be a lie, and `fake-x402.js` says so in its own header.

## Tier 3 — Coinbase testnet (real chain, real money that is worth nothing)

**Never in the gate. Run by a human, deliberately.** This is the tier that
proves the previous two were not fiction.

Coinbase supplies the whole path, and we use theirs rather than assembling our
own:

- **Base Sepolia** — `eip155:84532` in CAIP-2, which is the identifier already
  pinned in `gifos-x402.js` and served by the fake server, so tiers 2 and 3
  speak the same names.
- **CDP Faucet** — test USDC, from the CDP Portal or `requestFaucet` in the
  SDK. Their docs are explicit that you should use theirs rather than a
  third-party faucet, because it funds the same wallets the CDP Facilitator
  settles against. One request covers a long session; a test route costs well
  under a cent.
- **CDP Facilitator** — verification and settlement, authenticated with
  `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET`.
- **A real Base Account** with a real passkey, so the human-authentication step
  is exercised as a user experiences it, not stubbed.

One detail that simplifies our case: a seller receiving to an address they
already control sets `payToConfig` to `address` and **skips
`CDP_WALLET_SECRET`** entirely. GifOS app authors are exactly that — the payout
address is in their signed manifest — so GifOS never provisions or holds a
CDP-managed wallet, and never needs that secret.

### What tier 3 needs that we do not have yet

- ~~CDP API credentials~~ **Not needed on testnet after all (2026-08-25):**
  the x402.org facilitator settles Base Sepolia with no credentials, and the
  Worker's `FACILITATOR_URL` points there. CDP credentials become relevant at
  the MAINNET flag day, when the same wire moves to CDP's authed facilitator.
- **A funded Base Sepolia account** via the CDP faucet.
- **A device with a passkey.** This is why tier 3 cannot be automated in CI on
  a headless box: WebAuthn wants a real authenticator. Playwright can attach a
  *virtual* authenticator over CDP, which is good enough to exercise our code
  paths, but it is not proof that a real Secure Enclave prompt behaves the same.
  Both are worth running; neither replaces the other.

## What must never happen

- Mainnet in a test. The chain is pinned in code, and the refusal is unit
  tested — a mainnet quote is rejected before a human is ever shown a prompt.
- A credential in the repo, in a manifest, or in an app GIF.
- A gated test that needs the internet, a faucet, or a balance.
- A stub that pretends to verify a real signature. If a fake cannot check
  something, it says so in its own header rather than returning `true`.
