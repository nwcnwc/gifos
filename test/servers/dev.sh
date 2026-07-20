#!/usr/bin/env bash
# dev.sh — the local dev stack: THIS checkout's site + the local relay.
#
# Everything that can run off-production runs against this pair. It is the
# same stack the browser suites expect and the same one swarm.js / meet.js
# point at with --base/--relay:
#
#   test/servers/dev.sh                # site 8099 + relay 8790
#   test/servers/dev.sh --all          # + fake-ai 8791, keyapi 8792, cors 8793
#   test/servers/dev.sh --ai           # + fake-ai only
#   SITE_PORT=9099 RELAY_PORT=9790 test/servers/dev.sh
#
# Serves the site from THIS checkout, so it is safe to run from a worktree.
# Ctrl-C tears every child down.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SITE_PORT="${SITE_PORT:-8099}"
RELAY_PORT="${RELAY_PORT:-8790}"

WANT_AI=0 WANT_KEYAPI=0 WANT_CORS=0
for a in "$@"; do
  case "$a" in
    --all)    WANT_AI=1; WANT_KEYAPI=1; WANT_CORS=1 ;;
    --ai)     WANT_AI=1 ;;
    --keyapi) WANT_KEYAPI=1 ;;
    --cors)   WANT_CORS=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "dev.sh: unknown flag $a (try --help)" >&2; exit 2 ;;
  esac
done

PIDS=()
cleanup() { trap - INT TERM EXIT; for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup INT TERM EXIT

start() { # start <label> <cmd...>
  local label="$1"; shift
  "$@" >/dev/null 2>&1 &
  PIDS+=("$!")
  echo "[dev] $label  (pid $!)"
}

start "site   http://127.0.0.1:$SITE_PORT  ($ROOT/site)" \
  python3 -m http.server "$SITE_PORT" -d "$ROOT/site"
RELAY_PORT="$RELAY_PORT" start "relay  ws://127.0.0.1:$RELAY_PORT" \
  node "$HERE/relay-local.js"
[ "$WANT_AI" = 1 ]     && start "fake-ai         :8791" node "$HERE/fake-ai.js"
[ "$WANT_KEYAPI" = 1 ] && start "fake-keyapi     :8792" node "$HERE/fake-keyapi.js"
[ "$WANT_CORS" = 1 ]   && start "fake-cors-proxy :8793" node "$HERE/fake-cors-proxy.js"

echo "[dev] up — Ctrl-C to stop."
wait
