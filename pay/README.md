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

## Deploy

```bash
cd pay
npx wrangler deploy
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put GIFOS_PAY_SIGN_JWK    # Ed25519 JWK; its PUBLIC half MUST be site/gifos.key
# set PAYPAL_CLIENT_ID in the dashboard or wrangler.toml [vars]
```

`PAYPAL_BASE` stays `api-m.sandbox.paypal.com` and `FACILITATOR_URL` stays
`https://x402.org/facilitator` (settles Base Sepolia with no credentials)
until the mainnet flag day — which is a deliberate, argued change, not a
config drift (docs/payments.md "What this does NOT do").

The `platform_fees` split needs GifOS approved as a PayPal
marketplace/platform partner; until that approval, checkout works but the fee
instruction is refused by PayPal — test against `test/servers/fake-paypal.js`
(the gate does, hermetically: `test/browser/e2e-pay.js`).
