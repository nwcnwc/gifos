#!/usr/bin/env bash
#
# swarm-test-mode.sh — temporarily relax the Cloudflare rate-limit rule for
# YOUR OWN load test, then put it back. The rule is disabled zone-wide for the
# test window.
#
# The relay itself needs nothing: it has no per-address caps since 3 Oct 2026
# (relay/README.md "Limits"), so the TRUSTED_IPS allowlist redeploy this script
# used to do is gone. An IP list after `on` is accepted and ignored.
#
#   export CF_API_TOKEN=...        # for the Cloudflare rule toggle
#   ./scripts/swarm-test-mode.sh on
#   #  ... run the swarm ...
#   ./scripts/swarm-test-mode.sh off                            # restore the rule
#
# Needs jq + curl + CF_API_TOKEN (skipped with a warning if the token is absent).

set -uo pipefail
cd "$(dirname "$0")/.."
API="https://api.cloudflare.com/client/v4"
ZONE_NAME="${ZONE_NAME:-gifos.app}"
MODE="${1:-}"; IPS="${2:-}"

say()  { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗ %s\033[0m\n' "$*"; exit 1; }
CF_HDR=$(mktemp); chmod 600 "$CF_HDR"; printf 'Authorization: Bearer %s\n' "$CF_API_TOKEN" > "$CF_HDR"; trap 'rm -f "$CF_HDR"' EXIT
cf() { local m="$1" p="$2" b="${3:-}"; local a=(-s -X "$m" "$API$p" -H "@$CF_HDR" -H "Content-Type: application/json"); [ -n "$b" ] && a+=(--data "$b"); curl "${a[@]}"; }
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

case "$MODE" in
  on)
    say "SWARM TEST MODE: ON"
    trap 'set_rules_enabled true' ERR
    set_rules_enabled false
    say "Ready. Run your swarm. When done: ./scripts/swarm-test-mode.sh off"
    ;;
  off)
    say "SWARM TEST MODE: OFF (restoring protections)"
    set_rules_enabled true
    say "Protections restored."
    ;;
  *)
    echo "usage: $0 on   |   off"
    echo "  on  : disable the Cloudflare rate-limit rule"
    echo "  off : restore it"
    exit 2 ;;
esac
