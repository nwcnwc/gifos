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
#   ./test/servers/relay-dev.sh            # ws://127.0.0.1:8794
#   RELAY_DEV_PORT=9000 ./test/servers/relay-dev.sh
#
# Point pages at it: localStorage gifos_relay = ws://127.0.0.1:8794
# (or meet.js --relay ws://127.0.0.1:8794).
#
# THE DEPLOY LEVER: `touch relay/src/relay.js` hot-reloads the worker —
# a real script update, i.e. a Durable Object restart, i.e. a production
# deploy, locally and on demand. The DO's console.log output appears right
# here in the terminal (unlike prod, where wrangler tail dies on deploy).
set -eu
cd "$(dirname "$0")/../../relay"
exec npx wrangler dev --port "${RELAY_DEV_PORT:-8794}"
