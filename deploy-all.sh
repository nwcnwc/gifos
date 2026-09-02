#!/usr/bin/env bash
#
# Redeploy every Cloudflare Worker that backs GifOS, in one shot.
#
#   ./deploy-all.sh              # every Worker, pay included
#   ./deploy-all.sh --skip-pay   # everything except pay (payments not set up yet)
#
# The site itself (gifos.app) is NOT here — it's served by GitHub Pages, which
# auto-deploys on push to main. This script only covers the Workers.
#
# Prerequisites (one-time):
#   - wrangler installed and logged in:  npx wrangler login
#     (headless box? export CLOUDFLARE_API_TOKEN instead — `wrangler login`
#     needs a browser on the same machine.)
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

# --skip-pay leaves the pay Worker alone: not deployed, and its credential
# checks not run. For the stretch where payments are not set up yet, so a
# missing GIFOS_PAY_SIGN_JWK does not block redeploying mirror/relay/cors-proxy.
SKIP_PAY=0
for arg in "$@"; do
  case "$arg" in
    --skip-pay) SKIP_PAY=1 ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^#\{1,2\} \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg (try --skip-pay, --help)" >&2; exit 2 ;;
  esac
done

# Order is not load-bearing (mirror carries an explicit route allow-list, no
# wildcard, so nothing swallows relay/cors-proxy) — this is just a readable order.
#   mirror      gifos-mirror       0-9.gifos.app         (theme computers)
#   relay       gifos-relay        relay.gifos.app       (WebSocket signaling)
#   cors-proxy  gifos-cors-proxy   cors-proxy.gifos.app  (keyed-API CORS relay)
#   pay         gifos-pay          pay.gifos.app         (payments; docs/payments.md)
WORKERS=(mirror relay cors-proxy)
[ "$SKIP_PAY" = 1 ] || WORKERS+=(pay)

# Ask Cloudflare whether a secret is set. THREE outcomes, deliberately kept
# apart: 0 = set, 1 = genuinely absent, 2 = the question could not be asked
# (not logged in, API down, unreadable config). Collapsing 2 into 1 is what
# made an unauthenticated shell announce "secret is NOT set" and print a
# `secret put` line that fixed nothing — so wrangler's stderr is captured and
# shown, never dropped into /dev/null.
SECRET_LIST_OUT=""
secret_state() { # $1 = worker dir, $2 = secret name
  if SECRET_LIST_OUT=$(npx --yes "$WRANGLER" secret list -c "$1/wrangler.toml" 2>&1); then
    printf '%s' "$SECRET_LIST_OUT" | grep -q "\"name\": *\"$2\"" && return 0
    return 1
  fi
  return 2
}

# State 2 is a stop, not a diagnosis: say so, and repeat what wrangler said.
report_unreadable() { # $1 = worker dir, $2 = secret name
  echo "✗ $1: cannot tell whether $2 is set — \`$WRANGLER secret list\` failed:" >&2
  printf '%s\n' "$SECRET_LIST_OUT" | sed 's/^/    | /' >&2
  echo "  This is NOT a missing secret. Give wrangler access first:" >&2
  echo "    export CLOUDFLARE_API_TOKEN=…   (or: npx $WRANGLER login, on a machine with a browser)" >&2
}

# A secret a Worker needs, set once and never printed. A missing name is minted
# here from the OS entropy pool and piped straight into `wrangler secret put`,
# so the value never touches a shell variable, a file or the terminal. If the
# list cannot be read we stop rather than mint: minting over an unreadable list
# would ROTATE a salt that is already live and fine.
ensure_secret() { # $1 = worker dir, $2 = secret name
  local st=0; secret_state "$1" "$2" || st=$?
  case $st in
    0) echo "· $1: secret $2 is set" ;;
    1) echo "▶ $1: minting secret $2 …"
       openssl rand -hex 32 | npx --yes "$WRANGLER" secret put "$2" -c "$1/wrangler.toml"
       echo "✓ $1: secret $2 set" ;;
    *) report_unreadable "$1" "$2"; return 1 ;;
  esac
}

# A secret that is a real credential — a processor key, the receipt-signing
# JWK — can only be SET BY A PERSON. This never mints one; it says which are
# missing and, for the two the pay Worker cannot start without, fails the
# deploy so a Worker that would throw at init is not what lands on the domain.
require_secret() { # $1 = worker dir, $2 = secret name, $3 = "required" | "optional"
  local st=0; secret_state "$1" "$2" || st=$?
  case $st in
    0) echo "· $1: secret $2 is set" ;;
    1) if [ "$3" = required ]; then
         echo "✗ $1: secret $2 is NOT set — npx $WRANGLER secret put $2 -c $1/wrangler.toml   (see $1/README.md)" >&2
         return 1
       fi
       echo "· $1: secret $2 is not set (optional — that rail stays off)" ;;
    *) report_unreadable "$1" "$2"; return 1 ;;
  esac
}

# The pay Worker throws at init without its signing key and cannot reach
# PayPal without the client secret: check both BEFORE deploying it, so a
# missing one stops the script here rather than after the Worker is live.
# PAYPAL_CLIENT_ID is a plain var (public by nature), set in the dashboard or
# wrangler.toml — wrangler does not list vars, so it is not checked here.
if [ "$SKIP_PAY" = 1 ]; then
  echo "· pay: skipped (--skip-pay) — not deployed, secrets not checked"
else
  require_secret pay GIFOS_PAY_SIGN_JWK required
  require_secret pay PAYPAL_CLIENT_SECRET required
  require_secret pay STRIPE_SECRET_KEY optional
fi
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
