#!/usr/bin/env bash
#
# Redeploy every Cloudflare Worker that backs GifOS, in one shot.
#
#   ./deploy-all.sh
#
# The site itself (gifos.app) is NOT here — it's served by GitHub Pages, which
# auto-deploys on push to main. This script only covers the Workers.
#
# Prerequisites (one-time):
#   - wrangler installed and logged in:  npx wrangler login
#   - the proxied wildcard DNS record  A * -> 192.0.2.1 (orange cloud), which
#     already exists for the mirror and also covers cors-proxy.gifos.app.
#
# Each Worker is dependency-free (no package.json, no build step), so this is a
# plain loop. -c <dir>/wrangler.toml avoids cd; wrangler resolves each Worker's
# `main` relative to its own config, so paths still work.

set -euo pipefail
cd "$(dirname "$0")"

# PINNED. A bare `npx wrangler` resolves to whatever is newest on the registry
# at the moment of the deploy, so two deploys a week apart can run two
# different tools against the same config — and a compromised or broken
# release would ship straight into production Workers. Bump deliberately.
WRANGLER="wrangler@4.128.0"

# Order is not load-bearing (mirror carries an explicit route allow-list, no
# wildcard, so nothing swallows relay/cors-proxy) — this is just a readable order.
#   mirror      gifos-mirror       0-9.gifos.app         (theme computers)
#   relay       gifos-relay        relay.gifos.app       (WebSocket signaling)
#   cors-proxy  gifos-cors-proxy   cors-proxy.gifos.app  (keyed-API CORS relay)
#   pay         gifos-pay          pay.gifos.app         (payments; docs/payments.md)
WORKERS=(mirror relay cors-proxy pay)

# A secret a Worker needs, set once and never printed. `wrangler secret list`
# answers with a JSON array of {name,type}; a missing name is minted here from
# the OS entropy pool and piped straight into `wrangler secret put`, so the
# value never touches a shell variable, a file or the terminal.
ensure_secret() { # $1 = worker dir, $2 = secret name
  if npx --yes "$WRANGLER" secret list -c "$1/wrangler.toml" 2>/dev/null | grep -q "\"name\": *\"$2\""; then
    echo "· $1: secret $2 is set"
  else
    echo "▶ $1: minting secret $2 …"
    openssl rand -hex 32 | npx --yes "$WRANGLER" secret put "$2" -c "$1/wrangler.toml"
    echo "✓ $1: secret $2 set"
  fi
}

# A secret that is a real credential — a processor key, the receipt-signing
# JWK — can only be SET BY A PERSON. This never mints one; it says which are
# missing and, for the two the pay Worker cannot start without, fails the
# deploy so a Worker that would throw at init is not what lands on the domain.
require_secret() { # $1 = worker dir, $2 = secret name, $3 = "required" | "optional"
  if npx --yes "$WRANGLER" secret list -c "$1/wrangler.toml" 2>/dev/null | grep -q "\"name\": *\"$2\""; then
    echo "· $1: secret $2 is set"
  elif [ "$3" = required ]; then
    echo "✗ $1: secret $2 is NOT set — npx $WRANGLER secret put $2 -c $1/wrangler.toml   (see $1/README.md)" >&2
    return 1
  else
    echo "· $1: secret $2 is not set (optional — that rail stays off)"
  fi
}

# The pay Worker throws at init without its signing key and cannot reach
# PayPal without the client secret: check both BEFORE deploying it, so a
# missing one stops the script here rather than after the Worker is live.
# PAYPAL_CLIENT_ID is a plain var (public by nature), set in the dashboard or
# wrangler.toml — wrangler does not list vars, so it is not checked here.
require_secret pay GIFOS_PAY_SIGN_JWK required
require_secret pay PAYPAL_CLIENT_SECRET required
require_secret pay STRIPE_SECRET_KEY optional
echo

for d in "${WORKERS[@]}"; do
  echo "▶ deploying $d …"
  npx --yes "$WRANGLER" deploy -c "$d/wrangler.toml"
  echo "✓ $d deployed"
  echo
done

# The relay's per-IP abuse caps key on a salted hash of each socket's address
# (relay.js ipTag). Without this secret the salt is a public constant from the
# source, and a state or log dump is brute-forceable back to IPv4 addresses.
ensure_secret relay ABUSE_SALT
echo

echo "All ${#WORKERS[@]} Workers deployed."
