#!/bin/bash
# run.sh — the loop the gifos-meet tmux session runs. Keeps an INTERACTIVE
# meet.js REPL (test/swarm/meet.js) joined to the monitored room forever:
# if the process dies (crash, `quit` at the prompt), it rejoins in 5s.
#
# The pane auto-starts a `watch` stream (send-keys below) so an attached human
# sees live state immediately; press ENTER to pause it and get the `meet>`
# prompt (roster / tree / mon / net / shot ...), type `watch` to resume.
# The durable record is the --jsonl snapshot file, which ticks in ANY mode —
# pausing the on-screen stream never pauses the forensics.
set -u
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
ROOM="${MEET_ROOM:-test}"
NAME="${MEET_NAME:-MonitorBot}"
DATA="${MEET_DATA:-$HOME/gifos-meet-monitor}"
SESSION="${MEET_TMUX_SESSION:-gifos-meet}"
# MEET_EDGE=1 (default) pins the monitor to the EDGE channel — fixes land there
# first and the test room is a debugging surface. MEET_EDGE=0 follows whatever
# release version.json points default users at — set that when you want the
# monitor to see exactly what a fresh visitor sees.
EDGE_FLAG=""; [ "${MEET_EDGE:-1}" != "0" ] && EDGE_FLAG="--edge"
# MEET_PASS: the room's password, when the room is locked. Set it via a
# systemd drop-in on the host (systemctl --user edit gifos-meet-monitor),
# not in the repo unit. Harmless while the room is open.
PASS_ARGS=(); [ -n "${MEET_PASS:-}" ] && PASS_ARGS=(--pass "$MEET_PASS")
mkdir -p "$DATA"

while true; do
  # After the REPL has had time to join and seat, type `watch` into our own
  # pane so the stream starts without a human. Keystrokes land in readline's
  # buffer, so racing the prompt is harmless.
  ( sleep 25; tmux send-keys -t "$SESSION" 'watch 5 info' Enter 2>/dev/null ) &
  KICK=$!
  node "$REPO/test/swarm/meet.js" \
    --room "$ROOM" --name "$NAME" --cam $EDGE_FLAG "${PASS_ARGS[@]}" \
    --every 5 --jsonl "$DATA/snapshots-%d.jsonl" \
    2>> "$DATA/stderr.log"
  kill "$KICK" 2>/dev/null
  echo "[run.sh] meet.js exited — rejoining in 5s (ctrl-c me to stop for real)"
  sleep 5
done
