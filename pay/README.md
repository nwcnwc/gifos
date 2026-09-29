# gifos-pay — the payments Worker

The fiat and chain rails' server half (doctrine: `docs/payments.md`, testing:
`docs/payments-testing.md`). Stateless — no KV, no Durable Objects; a receipt's
facts ride inside the PayPal order itself, and /receipt asks PayPal, never a
store of ours.

No store either: every request that starts a payment carries the app's
signature PROOF (`GifOS.sign.proofOf` — the picture, the manifest, every other
file's sha256), and the Worker verifies it against the author's own key and
reads the payee and the allowed rails from the manifest as signed. Any signed
app can be paid; `BLOCKED` is the kill switch (`docs/payments.md` §THE AUTHOR
CHOOSES THE RAILS).

Every receipt names the signer that was paid (`payeeId`, `payeeType`), and
a sku is sold only at the price the author signed (`manifest.pay.prices`).
`/receipt/:id` and `/fednow/receipt/:id` are read with `?claim=&id=&type=`
— the claim the payment returned and the identity it was made to. The
Worker logs one JSON audit line per money event; read them in the
dashboard (Workers & Pages → gifos-pay → Logs) or live with
`npx wrangler tail gifos-pay` (`docs/payments.md` §WHO WAS PAID).

One brain, two wrappers: `src/core.js` runs unchanged here (via `src/pay.js`)
and in the gate's Node twin (`test/servers/pay-local.js`). What the gate
proves about one it proves about the other.

## Endpoints

| | |
|---|---|
| `POST /rails` | `{proof}` → which of the author's allowed rails (`capabilities.pay` in the signed manifest) this deployment can process right now, each `{ok}` or `{ok:false, why}`; the OS sheet draws only those |
| `POST /checkout` | `{proof, amount, sku, reason}` — derive the payee from the signing identity the proof VERIFIES (never the client, never the store), refuse if the author did not list `paypal`, create the PayPal order with the 3% `platform_fees` (503 while `PAYPAL_PARTNER` is not `approved`) |
| `GET /return` | PayPal lands the buyer back here; capture |
| `GET /receipt/:id?claim=` | PayPal's own answer, wrapped in an Ed25519-signed receipt the OS verifies against `gifos.app/gifos-pay.key` — only to the one-time claim `/checkout` returned, so an order id alone reads nothing |
| `POST /x402/settle` | the standard x402 facilitator wire (verify + settle per transfer of the 97/3 split), same signed-receipt shape |
| `POST /transfer/invoice` | the wallet-transfer rail (RockWallet + every self-custody wallet): signed stateless invoice, dust-unique amount, the signed manifest's `pay.to` |
| `POST /transfer/bind` | re-sign that invoice bound to the payer's wallet address (amount and dust unchanged), so only a transfer FROM that wallet completes it |
| `POST /transfer/receipt` | watch the chain (read-only `BASE_RPC`) for the exact transfer, from the bound wallet when there is one; same signed receipt, `feeCollected:false` |
| `POST /fednow/rfp` | FedNow via a provider (`FEDNOW_API`, Finzly-shaped — FedNow itself has no public API); payee = the registered account for the signing identity (`FEDNOW_PAYEES`) |
| `GET /fednow/receipt/:id` | poll the RfP to settlement; same signed receipt, `feeCollected:false` |
| `POST /mpp/offer` | `{proof, sku, amount}` → a signed `/mpp/charge/<offer>` link for exactly that purchase (an agent holds no app bytes, so the OS presents the proof once), plus a one-time `claim`; valid 30 minutes, one payment |
| `POST /mpp/status` | `{offer, claim}` → `PENDING`, or the signed receipt once the agent has paid that offer (found by the offer id stamped on the PaymentIntent, via Stripe's search API) — how the OS sheet's "Pay with your AI agent" finishes on its own |
| `GET\|POST /mpp/charge/<offer>` | the AGENT rail — Machine Payments Protocol (HTTP 402, mpp.dev), the wire Stripe's Link agent wallet speaks (link.com/agents): a `WWW-Authenticate: Payment … method="stripe"` challenge, then a Shared Payment Token back, settled as a Stripe Connect DESTINATION charge to the author's connected account with the 3% as `application_fee_amount`; same signed receipt, plus a `Payment-Receipt` header |
| `POST /receipt/file` | package a signed receipt as the receipt GIF the OS opens — verified first; how an agent's purchase reaches the human's Purchases folder |

## An agent buying something

```bash
npx skills add stripe/link-cli          # once: the Link agent wallet skill
npx @stripe/link-cli auth login         # once: the human links their Link account
npx @stripe/link-cli mpp pay "<the /mpp/charge/<offer> link from POST /mpp/offer>" \
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

`./deploy-all.sh` at the repo root deploys this Worker with the other three
(wrangler pinned) and refuses to start when `GIFOS_PAY_SIGN_JWK` or
`PAYPAL_CLIENT_SECRET` is not set. `./deploy-all.sh --skip-pay` leaves this
Worker out entirely — neither deployed nor checked — so the other three can be
redeployed while payments are not set up. Setting the secrets is a one-time,
by-hand step:

```bash
cd pay
npx wrangler deploy
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put GIFOS_PAY_SIGN_JWK < ~/.config/gifos/pay-sign.jwk   # the Worker's OWN key (node pay/gen-key.mjs); public half = site/gifos-pay.key, never site/gifos.key
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
against Stripe's sandbox, `npx mppx@latest validate <an /mpp/charge/<offer> link>`
and `link-cli … --test`.

`PAYPAL_BASE` stays `api-m.sandbox.paypal.com` and `FACILITATOR_URL` stays
`https://x402.org/facilitator` (settles Base Sepolia with no credentials)
until the mainnet flag day — which is a deliberate, argued change, not a
config drift (docs/payments.md "What this does NOT do").

The `platform_fees` split needs GifOS approved as a PayPal
marketplace/platform partner. Until that approval PayPal refuses the WHOLE
order, not just the fee: `422 UNPROCESSABLE_ENTITY`, issue
`PLATFORM_FEES_NOT_SUPPORTED` (measured against the sandbox on the first
deploy, 2026-09-28 — /checkout answers `502 PayPal refused the order` and the
Worker log carries PayPal's reason). So the PayPal rail is dark until the
partner approval lands; test it against `test/servers/fake-paypal.js` (the
gate does, hermetically: `test/browser/e2e-pay.js`).
