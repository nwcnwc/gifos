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
# Host-local config (room password etc.) lives in a dotfile, NOT in systemd
# Environment= — the tmux SERVER outlives service restarts when other sessions
# exist, and a persisted server hands new sessions its own stale environment,
# silently dropping unit env changes. A sourced file has no such failure mode.
[ -f "$HOME/.config/gifos-meet-monitor.env" ] && . "$HOME/.config/gifos-meet-monitor.env"
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
# MEET_PASS: the room password the monitor KEEPS (--ensure-pass): it joins an
# open room and locks it with this, or presents it at an already-locked door.
# Set it in ~/.config/gifos-meet-monitor.env on the host (chmod 600), never in
# the repo. Empty = the monitor neither locks nor presents anything.
PASS_ARGS=(); [ -n "${MEET_PASS:-}" ] && PASS_ARGS=(--ensure-pass "$MEET_PASS")
mkdir -p "$DATA"

# A LONG-LIVED MONITOR MUST NOT FOSSILIZE (Nathan, 2026-08-04, after its
# ~7h-stale keeper page fought a fresh client's password for a minute):
# every (re)spawn pulls the current code, and the bot is recycled DAILY so
# its page never runs an edge build more than a day old. The recycle is a
# plain kill — the keeper re-enters and re-locks, the exact churn a phone
# user's close-and-reopen already exercises.
RECYCLE_SECS="${MEET_RECYCLE_SECS:-86400}"

# THE PHONE IS PART OF THE ROOM (Nathan, 2026-08-04). A USB-tethered moto sits
# in the monitored meeting as the real-hardware peer — the only participant
# with a real camera, a real radio and a real battery. But the monitor LOCKS
# the room (--ensure-pass) and run.html takes no password URL param, so every
# time that tab reloads — Chrome restart, OOM, or our own daily recycle — the
# phone lands on "This room is locked" and stays there, silently, forever.
# Found exactly that way: Chrome force-stopped at ~00:00, phone parked at the
# door, room read occ=1 for hours with nothing in the forensics to say why.
#
# So each spawn also runs a keeper pass against the phone: present the
# password, then turn the camera on. Both idempotent — a healthy phone is a
# no-op. It is ADVISORY: it never touches the monitor's own lifecycle, and a
# host with no phone plugged in skips it silently.
#   MEET_MOTO=0        turn the keeper off entirely
#   MEET_MOTO_EVERY    seconds between passes (default 120)
#   MEET_MOTO_LAUNCH=1 also relaunch Chrome when NO meet tab exists at all
#                      (default OFF — cdp-moto.js's rule holds: Nathan placed
#                      that tab, and a keeper that re-navigates on its own
#                      fights a human who parked the phone on purpose)
MOTO_EVERY="${MEET_MOTO_EVERY:-120}"

while true; do
  # Fresh code for the driver and the next page load. --ff-only: a monitor
  # host never mints merges; a diverged checkout is reported loudly and the
  # monitor keeps running on what's here (its job is presence, not deploys).
  git -C "$REPO" pull --ff-only origin main >> "$DATA/stderr.log" 2>&1 \
    || echo "[run.sh] git pull failed (diverged checkout or offline) — running the code already here" >> "$DATA/stderr.log"
  # After the REPL has had time to join and seat, type `watch` into our own
  # pane so the stream starts without a human. Keystrokes land in readline's
  # buffer, so racing the prompt is harmless.
  ( sleep 25; tmux send-keys -t "$SESSION" 'watch 5 info' Enter 2>/dev/null ) &
  KICK=$!
  # The keeper's FIRST pass waits out the bot's own join+lock: presenting the
  # password at a door the monitor has not locked yet just races it.
  MOTO=""
  if [ "${MEET_MOTO:-1}" != "0" ]; then
    ( sleep 40
      while true; do
        MEET_PASS="${MEET_PASS:-}" MEET_ROOM="$ROOM" MEET_EDGE="${MEET_EDGE:-1}" \
          node "$REPO/test/swarm/monitor/moto-keeper.js" >> "$DATA/moto-keeper.log" 2>&1
        sleep "$MOTO_EVERY"
      done ) &
    MOTO=$!
  fi
  # --foreground keeps the REPL interactive on the tty; at RECYCLE_SECS the
  # child gets TERM (exit 124) and the loop respawns it onto current code.
  # GIFOS_RESIDENT=1 rides into the browser process environment (meet.js
  # passes env through outside drive mode) and marks this browser as a
  # RESIDENT SERVICE: release.sh's reap_browsers() exempts it. Without the
  # marker a gate battery on this box kill -9'd the bot's chrome at every
  # suite boundary (13 times in one drills run, 2026-08-06).
  GIFOS_RESIDENT=1 timeout --foreground "$RECYCLE_SECS" \
    node "$REPO/test/swarm/meet.js" \
    --room "$ROOM" --name "$NAME" --cam $EDGE_FLAG "${PASS_ARGS[@]}" \
    --every 5 --jsonl "$DATA/snapshots-%d.jsonl" \
    2>> "$DATA/stderr.log"
  RC=$?
  # Reap the keeper with the page it was keeping — a pass that outlives its
  # meet.js would drive the phone against a room the bot has already left.
  # Children first: killing the subshell alone orphans an in-flight node/sleep.
  if [ -n "$MOTO" ]; then pkill -P "$MOTO" 2>/dev/null; kill "$MOTO" 2>/dev/null; fi
  if [ "$RC" = 124 ]; then
    echo "[run.sh] daily recycle — pulling and reloading onto the current build"
  else
    echo "[run.sh] meet.js exited ($RC) — rejoining in 5s (ctrl-c me to stop for real)"
    sleep 5
  fi
done
