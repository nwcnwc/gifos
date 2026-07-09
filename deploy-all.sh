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

# Order is not load-bearing (mirror carries an explicit route allow-list, no
# wildcard, so nothing swallows relay/cors-proxy) — this is just a readable order.
#   mirror      gifos-mirror       0-9.gifos.app         (theme computers)
#   relay       gifos-relay        relay.gifos.app       (WebSocket signaling)
#   cors-proxy  gifos-cors-proxy   cors-proxy.gifos.app  (keyed-API CORS relay)
#   mcp         gifos-mcp          mcp.gifos.app          (AI builds app GIFs)
WORKERS=(mirror relay cors-proxy mcp)

for d in "${WORKERS[@]}"; do
  echo "▶ deploying $d …"
  npx wrangler deploy -c "$d/wrangler.toml"
  echo "✓ $d deployed"
  echo
done

echo "All ${#WORKERS[@]} Workers deployed."
