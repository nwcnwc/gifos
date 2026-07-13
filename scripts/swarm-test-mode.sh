#!/usr/bin/env bash
#
# swarm-test-mode.sh — temporarily relax the abuse protections for YOUR OWN
# load test, then put them back. Two guards block a swarm, and this flips both:
#
#   1. The relay's PER-IP caps (8 sockets/IP, 120 joins/min/IP, edge limiter) —
#      relaxed only for the IPs you name, by deploying the relay with a
#      TRUSTED_IPS allowlist. Everyone else stays fully capped.
#   2. The Cloudflare rate-limit rule — disabled zone-wide for the test window
#      (the relay's own per-IP caps still protect against non-allowlisted IPs).
#
# WHICH IPs: only the ones running MANY bots need listing — your home network's
# public IP (get it with `curl -s ifconfig.me`) and any AWS box packing >8 bots.
# Instances running <=8 bots each are already under the cap; don't bother.
#
#   export CF_API_TOKEN=...        # for the Cloudflare rule toggle (optional)
#   ./scripts/swarm-test-mode.sh on  203.0.113.7,198.51.100.4   # home + a big box
#   #  ... run the swarm ...
#   ./scripts/swarm-test-mode.sh off                            # restore everything
#
# Needs wrangler (logged in) for the relay redeploy; jq + curl + CF_API_TOKEN
# for the Cloudflare rule (skipped with a warning if the token is absent).

set -uo pipefail
cd "$(dirname "$0")/.."
API="https://api.cloudflare.com/client/v4"
ZONE_NAME="${ZONE_NAME:-gifos.app}"
MODE="${1:-}"; IPS="${2:-}"

say()  { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗ %s\033[0m\n' "$*"; exit 1; }
cf() { local m="$1" p="$2" b="${3:-}"; local a=(-s -X "$m" "$API$p" -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json"); [ -n "$b" ] && a+=(--data "$b"); curl "${a[@]}"; }
succeeded() { [ "$(echo "$1" | jq -r '.success // false')" = "true" ]; }

# --- toggle the Cloudflare gifos-harden rate-limit rule(s) enabled/disabled ---
set_rules_enabled() { # $1 = true|false
  if [ -z "${CF_API_TOKEN:-}" ]; then
    warn "CF_API_TOKEN not set — skipping the Cloudflare rule. Toggle it by hand if needed:"
    warn "  zone → Security → WAF → Rate limiting rules → enable/disable the gifos-harden rule."
    return
  fi
  command -v jq >/dev/null || die "jq is required for the Cloudflare rule toggle."
  local Z RSID EP NEW R
  Z=$(cf GET "/zones?name=$ZONE_NAME"); succeeded "$Z" || die "zone lookup failed (check the token)."
  local ZID; ZID=$(echo "$Z" | jq -r '.result[0].id')
  EP=$(cf GET "/zones/$ZID/rulesets/phases/http_ratelimit/entrypoint")
  if ! succeeded "$EP"; then warn "No rate-limit ruleset exists yet — nothing to toggle."; return; fi
  RSID=$(echo "$EP" | jq -r '.result.id')
  if ! echo "$EP" | jq -e '.result.rules[]? | select((.description//"")|startswith("gifos-harden:"))' >/dev/null; then
    warn "No gifos-harden rate-limit rule found — nothing to toggle (run scripts/cloudflare-harden.sh first if you want one)."; return
  fi
  NEW=$(echo "$EP" | jq --argjson en "$1" '[.result.rules[]
        | (if ((.description//"")|startswith("gifos-harden:")) then .enabled=$en else . end)
        | del(.id,.version,.last_updated,.ref)]')
  R=$(cf PUT "/zones/$ZID/rulesets/$RSID" "$(jq -n --argjson r "$NEW" '{rules:$r}')")
  if succeeded "$R"; then ok "Cloudflare rate-limit rule set enabled=$1"
  else warn "Couldn't toggle the rule:"; echo "$R" | jq -r '(.errors//[])[] | "        [\(.code)] \(.message)"'; fi
}

# --- redeploy the relay with (or without) the TRUSTED_IPS allowlist ----------
deploy_relay() { # $1 = comma-ip-list or ""
  command -v npx >/dev/null || die "npx/wrangler not found — can't redeploy the relay."
  if [ -n "$1" ]; then
    say "Deploying relay with TRUSTED_IPS allowlist: $1"
    npx wrangler deploy -c relay/wrangler.toml --var "TRUSTED_IPS:$1" || die "relay deploy failed."
    ok "relay live — those IPs now bypass the per-IP caps"
  else
    say "Redeploying relay with caps back to normal (no allowlist)"
    npx wrangler deploy -c relay/wrangler.toml || die "relay deploy failed."
    ok "relay live — per-IP caps enforced for everyone again"
  fi
}

case "$MODE" in
  on)
    [ -n "$IPS" ] || die "usage: $0 on <ip1,ip2,...>   (the IPs running many bots — home + any dense AWS box)"
    say "SWARM TEST MODE: ON"
    set_rules_enabled false
    deploy_relay "$IPS"
    say "Ready. Run your swarm. When done: ./scripts/swarm-test-mode.sh off"
    ;;
  off)
    say "SWARM TEST MODE: OFF (restoring protections)"
    set_rules_enabled true
    deploy_relay ""
    say "Protections restored."
    ;;
  *)
    echo "usage: $0 on <ip1,ip2,...>   |   off"
    echo "  on  : allowlist those IPs in the relay + disable the Cloudflare rate-limit rule"
    echo "  off : restore both"
    exit 2 ;;
esac
