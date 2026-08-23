#!/bin/bash
# relay-dev.sh — run the REAL production relay (relay/src/relay.js) locally
# under `wrangler dev` (workerd: actual Durable Objects, hibernatable
# WebSockets, socket attachments — everything relay-local.js cannot have).
#
# relay-local.js stays the fast stand-in for protocol-level suites; THIS is
# the harness for relay-BEHAVIOR tests: DO restarts, hibernation, registry
# survival, wedge recovery. The two bugs of 2026-07-26 (the accept-path
# wedge, the post-deploy newcomer stall) live exactly in the layer only
# this harness exercises.
#
#   ./test/servers/relay-dev.sh            # ws://0.0.0.0:8794 (loopback AND the
#                                          # tailnet address fleet clients dial)
#   RELAY_DEV_PORT=9000 ./test/servers/relay-dev.sh
#
# Point pages at it: localStorage gifos_relay = ws://127.0.0.1:8794
# (or meet.js --relay ws://127.0.0.1:8794). Fleet behavior uses
# ~/.gifos-behavior-hosts.json relayDev (ws://<orchestrator-tailnet>:8794),
# so this MUST bind every interface — wrangler's default is loopback, which
# made 04b SKIP on the 0.9.10 gate (the scenario saw nothing at the tailnet
# IP even though workerd was up).
#
# THE DEPLOY LEVER: `touch relay/src/relay.js` hot-reloads the worker —
# a real script update, i.e. a Durable Object restart, i.e. a production
# deploy, locally and on demand. The DO's console.log output appears right
# here in the terminal (unlike prod, where wrangler tail dies on deploy).
set -eu
cd "$(dirname "$0")/../../relay"
# Fleet clients load the orchestrator's site (hosts-file `base`), so their
# Origin is that URL, not localhost. Without it in ALLOWED_ORIGINS, wrangler
# answers 403 forbidden origin and 04b/20a never seat. The address lives in
# the local hosts file — never committed.
ORIGINS='https://gifos.app,*.gifos.app,http://127.0.0.1:8099,http://localhost:8099'
HOSTS="${GIFOS_FLEET:-${BEHAVIOR_HOSTS:-$HOME/.gifos-behavior-hosts.json}}"
if [ -f "$HOSTS" ]; then
  BASE=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1])); if(j.base) console.log(j.base)}catch(e){}' "$HOSTS")
  [ -n "$BASE" ] && ORIGINS="$ORIGINS,$BASE"
fi
exec npx wrangler dev --ip 0.0.0.0 --port "${RELAY_DEV_PORT:-8794}" --var "ALLOWED_ORIGINS:$ORIGINS"
