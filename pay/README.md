# gifos-pay — the payments Worker

The fiat and chain rails' server half (doctrine: `docs/payments.md`, testing:
`docs/payments-testing.md`). Stateless — no KV, no Durable Objects; a receipt's
facts ride inside the PayPal order itself, and /receipt asks PayPal, never a
store of ours.

One brain, two wrappers: `src/core.js` runs unchanged here (via `src/pay.js`)
and in the gate's Node twin (`test/servers/pay-local.js`). What the gate
proves about one it proves about the other.

## Endpoints

| | |
|---|---|
| `POST /checkout` | derive the payee from the app's signing identity in the PUBLISHED catalog (never the client), create the PayPal order with the 3% `platform_fees` |
| `GET /return` | PayPal lands the buyer back here; capture |
| `GET /receipt/:id` | PayPal's own answer, wrapped in an Ed25519-signed receipt the OS verifies against `gifos.app/gifos.key` |
| `POST /x402/settle` | the standard x402 facilitator wire (verify + settle per transfer of the 97/3 split), same signed-receipt shape |
| `POST /transfer/invoice` | the wallet-transfer rail (RockWallet + every self-custody wallet): signed stateless invoice, dust-unique amount, catalog payee |
| `POST /transfer/receipt` | watch the chain (read-only `BASE_RPC`) for the exact transfer; same signed receipt, `feeCollected:false` |
| `POST /fednow/rfp` | FedNow via a provider (`FEDNOW_API`, Finzly-shaped — FedNow itself has no public API); payee = the registered account for the signing identity (`FEDNOW_PAYEES`) |
| `GET /fednow/receipt/:id` | poll the RfP to settlement; same signed receipt, `feeCollected:false` |
| `GET\|POST /mpp/charge/:appId?sku=&amount=` | the AGENT rail — Machine Payments Protocol (HTTP 402, mpp.dev), the wire Stripe's Link agent wallet speaks (link.com/agents): a `WWW-Authenticate: Payment … method="stripe"` challenge, then a Shared Payment Token back, settled as a Stripe Connect DESTINATION charge to the author's connected account with the 3% as `application_fee_amount`; same signed receipt, plus a `Payment-Receipt` header |
| `POST /receipt/file` | package a signed receipt as the receipt GIF the OS opens — verified first; how an agent's purchase reaches the human's Purchases folder |

## An agent buying something

```bash
npx skills add stripe/link-cli          # once: the Link agent wallet skill
npx @stripe/link-cli auth login         # once: the human links their Link account
npx @stripe/link-cli mpp pay "https://pay.gifos.app/mpp/charge/<appId>?sku=<sku>&amount=<base units>" \
  --context "Buying <sku> for <app> on GifOS for <who>, because …"     # ≥100 chars
```

The human approves in the Link app (that is the consent step — theirs, not
ours, exactly as the FedNow approval is the bank's). The 200 body carries
the signed receipt and a `file` instruction; `POST /receipt/file` with that
body returns the receipt GIF. Hand it to the person: opening it in any
GifOS grants the entitlement (`docs/payments.md` §The receipt is a FILE).
`amount` is USDC base units like every other rail (`$5 = 5000000`); Stripe
takes nothing under $0.50, and the challenge's `request.amount` is in cents
because that is MPP's wire.

## Deploy

```bash
cd pay
npx wrangler deploy
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put GIFOS_PAY_SIGN_JWK    # Ed25519 JWK; its PUBLIC half MUST be site/gifos.key
# set PAYPAL_CLIENT_ID in the dashboard or wrangler.toml [vars]
npx wrangler secret put STRIPE_SECRET_KEY     # the agent rail: sk_test_ until the mainnet flag day
# set STRIPE_PROFILE_ID (profile_test_…, from the Stripe Dashboard → Profile) and
# STRIPE_PAYEES ({"<signing identity>": "acct_…"} for onboarded authors) in [vars]
```

The agent rail needs a Stripe account with Connect and a Stripe profile
(Shared Payment Tokens are a preview surface — US/CA/EU sellers, the
agentic-commerce seller terms, `Stripe-Version: 2026-07-29.preview`), and
each author who wants agent buyers connects an Express account — the same
ask the PayPal rail makes (a processor account behind the payee), the only
difference being that Stripe wants it before the first cent rather than
after (`docs/payments.md` §FIVE RAILS). Hermetic
test: `test/servers/fake-stripe.js`, driven by `test/browser/e2e-pay.js`;
against Stripe's sandbox, `npx mppx@latest validate https://pay.gifos.app/mpp/charge/<appId>?amount=…`
and `link-cli … --test`.

`PAYPAL_BASE` stays `api-m.sandbox.paypal.com` and `FACILITATOR_URL` stays
`https://x402.org/facilitator` (settles Base Sepolia with no credentials)
until the mainnet flag day — which is a deliberate, argued change, not a
config drift (docs/payments.md "What this does NOT do").

The `platform_fees` split needs GifOS approved as a PayPal
marketplace/platform partner; until that approval, checkout works but the fee
instruction is refused by PayPal — test against `test/servers/fake-paypal.js`
(the gate does, hermetically: `test/browser/e2e-pay.js`).
