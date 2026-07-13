#!/usr/bin/env bash
#
# cloudflare-harden.sh — one-shot abuse/cost hardening for the GifOS Cloudflare
# account, driven entirely by the Cloudflare API (v4). Run it instead of clicking
# through the dashboard. It is IDEMPOTENT (safe to re-run) and supports --dry-run.
#
# What it does:
#   1. Reads your zone + account IDs and prints your Workers/zone plan (the real
#      anti-bankruptcy fact: Workers Free = hard 100k req/day, NO overage).
#   2. Creates three per-IP Rate-Limiting rules (the global cap the in-code
#      per-isolate limiters can't be):
#        - relay.gifos.app        60/min  -> block          (WS: block, never challenge)
#        - cors-proxy.gifos.app  240/min  -> block
#        - gifos.app + *.gifos.app 1000/min -> managed challenge  (site/theme backstop)
#   3. Turns on Bot Fight Mode.
#   4. Tears down the removed MCP Worker: deletes the gifos-mcp script, its
#      Workers custom domain, and the mcp.gifos.app DNS record.
#   5. (optional) Creates a billing/usage email alert with --alert-email you@x.
#
# ---- SETUP -------------------------------------------------------------------
# Create a SCOPED API token at https://dash.cloudflare.com/profile/api-tokens
# ("Create Custom Token") with these permissions:
#   Zone    · gifos.app · Zone:Read, Zone WAF:Edit, Zone Settings:Edit, DNS:Edit
#   Account · <your acct> · Workers Scripts:Edit, Account Settings:Read
#   (only if you use --alert-email) Account · Notifications:Edit
#
#   export CF_API_TOKEN=xxxxxxxx
#   ./scripts/cloudflare-harden.sh --dry-run     # preview every change first
#   ./scripts/cloudflare-harden.sh               # apply
#
# --dry-run still performs READ calls (harmless) but skips every write.
# Needs: bash, curl, jq.
# ------------------------------------------------------------------------------

set -uo pipefail

ZONE_NAME="${ZONE_NAME:-gifos.app}"
API="https://api.cloudflare.com/client/v4"
DRY=0
ALERT_EMAIL=""
SKIP_MCP=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --keep-mcp) SKIP_MCP=1 ;;
    --alert-email=*) ALERT_EMAIL="${a#*=}" ;;
    -h|--help) sed -n '2,44p' "$0"; exit 0 ;;
    *) echo "unknown arg: $a (try --help)"; exit 2 ;;
  esac
done

command -v jq   >/dev/null || { echo "jq is required (brew install jq / apt install jq)"; exit 1; }
command -v curl >/dev/null || { echo "curl is required"; exit 1; }
[ -n "${CF_API_TOKEN:-}" ] || { echo "Set CF_API_TOKEN (see SETUP at the top of this script)."; exit 1; }

say()  { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗ %s\033[0m\n' "$*"; exit 1; }

# cf METHOD PATH [JSON_BODY] — returns the raw response JSON on stdout.
# In --dry-run, non-GET calls are printed and NOT sent (returns a stub success).
cf() {
  local m="$1" p="$2" b="${3:-}"
  if [ "$DRY" = 1 ] && [ "$m" != "GET" ]; then
    printf '  \033[36mDRY %s %s\033[0m\n' "$m" "$p" >&2
    [ -n "$b" ] && printf '      %s\n' "$(echo "$b" | jq -c . 2>/dev/null || echo "$b")" >&2
    echo '{"success":true,"result":{},"dry":true}'; return 0
  fi
  local args=(-s -X "$m" "$API$p" -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json")
  [ -n "$b" ] && args+=(--data "$b")
  curl "${args[@]}"
}
# errors JSON -> prints Cloudflare error messages (empty if none)
errors() { echo "$1" | jq -r '(.errors // [])[] | "        [\(.code)] \(.message)"'; }
succeeded() { [ "$(echo "$1" | jq -r '.success')" = "true" ]; }

# ---- 1. identity + plan ------------------------------------------------------
say "Looking up zone '$ZONE_NAME' and account"
ZRESP=$(cf GET "/zones?name=$ZONE_NAME")
succeeded "$ZRESP" || { errors "$ZRESP"; die "Could not read the zone — check the token's Zone:Read permission."; }
ZID=$(echo "$ZRESP" | jq -r '.result[0].id // empty')
AID=$(echo "$ZRESP" | jq -r '.result[0].account.id // empty')
PLAN=$(echo "$ZRESP" | jq -r '.result[0].plan.name // "unknown"')
[ -n "$ZID" ] || die "Zone '$ZONE_NAME' not found on this account."
ok "zone $ZID · account $AID · zone plan: $PLAN"
WPLAN=$(cf GET "/accounts/$AID/workers/subscription" 2>/dev/null | jq -r '.result.subscription_type // empty' 2>/dev/null || true)
if [ -n "${WPLAN:-}" ]; then ok "Workers plan: $WPLAN"; fi
warn "Reminder: Workers FREE has no overage — a flood just returns 429s until UTC midnight. Paid overage is ~\$0.30 / million requests; the rules below are your ceiling."

# ---- 2. rate-limiting rules --------------------------------------------------
say "Rate-limiting rules (per IP, per edge PoP)"
RULES=$(jq -n --arg z "$ZONE_NAME" '
  [ { description:"gifos-harden: relay flood cap",
      expression:"(http.host eq \"relay.\($z)\")", action:"block",
      ratelimit:{characteristics:["ip.src","cf.colo.id"], period:60, requests_per_period:60, mitigation_timeout:60} },
    { description:"gifos-harden: cors-proxy flood cap",
      expression:"(http.host eq \"cors-proxy.\($z)\")", action:"block",
      ratelimit:{characteristics:["ip.src","cf.colo.id"], period:60, requests_per_period:240, mitigation_timeout:60} },
    { description:"gifos-harden: site + theme backstop",
      expression:"(http.host eq \"\($z)\" or ends_with(http.host, \".\($z)\"))", action:"managed_challenge",
      ratelimit:{characteristics:["ip.src","cf.colo.id"], period:60, requests_per_period:1000, mitigation_timeout:60} } ]')
# The Free plan allows only ONE http_ratelimit rule, so keep a consolidated
# fallback: block ANY subdomain (relay, cors-proxy, 0-9 mirror — the
# Worker/DO-backed hosts, i.e. the ones that actually cost money) that floods.
# 600/min is generous for a real page load yet shuts a hot loop.
SINGLE=$(jq -n --arg z "$ZONE_NAME" '
  [ { description:"gifos-harden: subdomain flood cap",
      expression:"(ends_with(http.host, \".\($z)\"))", action:"block",
      ratelimit:{characteristics:["ip.src","cf.colo.id"], period:60, requests_per_period:600, mitigation_timeout:60} } ]')
EP=$(cf GET "/zones/$ZID/rulesets/phases/http_ratelimit/entrypoint")
RSID=$(echo "$EP" | jq -r '.result.id // empty')
push_rules() { # $1 = rules array -> creates/updates the http_ratelimit ruleset
  if succeeded "$EP"; then
    # keep any rules that AREN'T ours (by description prefix) faithfully,
    # dropping only server-managed fields a PUT won't accept back
    local keep combined
    keep=$(echo "$EP" | jq '[.result.rules[]? | select((.description // "") | startswith("gifos-harden:") | not)
             | del(.id, .version, .last_updated, .ref)]' 2>/dev/null || echo '[]')
    combined=$(jq -n --argjson a "$keep" --argjson b "$1" '$a + $b')
    cf PUT "/zones/$ZID/rulesets/$RSID" "$(jq -n --argjson r "$combined" '{rules:$r}')"
  else
    cf POST "/zones/$ZID/rulesets" "$(jq -n --argjson r "$1" '{name:"gifos rate limits", kind:"zone", phase:"http_ratelimit", rules:$r}')"
  fi
}
R=$(push_rules "$RULES"); N=3
# 50001 = too many rules for this plan (Free = 1). Collapse to the single rule.
if ! succeeded "$R" && echo "$R" | jq -e '((.errors // [])[] | select(.code == 50001))' >/dev/null 2>&1; then
  warn "This plan allows only ONE rate-limit rule — consolidating to a single subdomain flood cap."
  R=$(push_rules "$SINGLE"); N=1
fi
if succeeded "$R"; then ok "$N rate-limit rule(s) in place (re-running just refreshes them)"
else warn "Rate-limit rules were rejected:"; errors "$R"
     warn "Paste this to me and I'll adjust the schema."; fi

# ---- 3. bot fight mode -------------------------------------------------------
say "Bot Fight Mode"
B=$(cf PUT "/zones/$ZID/bot_management" '{"fight_mode":true}')
if succeeded "$B"; then ok "Bot Fight Mode on"
else warn "Couldn't toggle Bot Fight Mode via API (plan/endpoint varies):"; errors "$B"
     warn "Set it by hand: zone → Security → Bots → Bot Fight Mode."; fi

# ---- 4. tear down the removed MCP worker ------------------------------------
if [ "$SKIP_MCP" = 0 ]; then
  say "Removing the retired MCP Worker (gifos-mcp) and mcp.$ZONE_NAME"
  D=$(cf DELETE "/accounts/$AID/workers/scripts/gifos-mcp")
  if succeeded "$D"; then ok "worker script gifos-mcp deleted"; else warn "worker delete:"; errors "$D"; fi
  DOMS=$(cf GET "/accounts/$AID/workers/domains?hostname=mcp.$ZONE_NAME")
  for did in $(echo "$DOMS" | jq -r '.result[]?.id'); do
    cf DELETE "/accounts/$AID/workers/domains/$did" >/dev/null && ok "workers custom domain mcp.$ZONE_NAME removed"
  done
  RECS=$(cf GET "/zones/$ZID/dns_records?name=mcp.$ZONE_NAME")
  for rid in $(echo "$RECS" | jq -r '.result[]?.id'); do
    cf DELETE "/zones/$ZID/dns_records/$rid" >/dev/null && ok "DNS record mcp.$ZONE_NAME deleted"
  done
  echo "$DOMS$RECS" | grep -q '"id"' || ok "nothing left to remove for mcp.$ZONE_NAME (already gone)"
fi

# ---- 5. optional billing alert ----------------------------------------------
if [ -n "$ALERT_EMAIL" ]; then
  say "Billing/usage email alert -> $ALERT_EMAIL"
  A=$(cf POST "/accounts/$AID/alerting/v3/policies" "$(jq -n --arg e "$ALERT_EMAIL" '
     {name:"GifOS Workers usage", alert_type:"billing_usage_alert", enabled:true,
      mechanisms:{email:[{id:$e}]}, filters:{}}')")
  if succeeded "$A"; then ok "alert created (confirm the email from Cloudflare)"
  else warn "Alert API rejected it (alert_type varies by account):"; errors "$A"
       warn "Do this one in the dashboard: Notifications → Add → Usage-Based Billing."; fi
fi

say "Done.${DRY:+  (dry-run — nothing was changed)}"
[ "$DRY" = 1 ] && echo "Re-run without --dry-run to apply."
