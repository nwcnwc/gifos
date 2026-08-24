# gifos-meet-monitor — the "test" room's resident observer

A systemd **user** service that keeps `test/swarm/meet.js` (the meeting CLI)
joined to the long-running `test` room on gifos.app, **inside a tmux session**,
so it is simultaneously:

- a **participant** (holds a real seat, camera on — solid swatch),
- a **recorder** — one JSON snapshot line every 5s to
  `~/gifos-meet-monitor/snapshots-YYYY-MM-DD.jsonl` (per-peer coord / ip /
  conn / vid / **relay** = friend-relay via, ghosts, dups, tx paths, mosaic
  state — everything `debugDump()` knows), rotating daily, ticking regardless
  of what the interactive pane shows, and
- a **debug console you can attach to**:

```bash
ssh <pi> -t 'tmux attach -t gifos-meet'
#   ENTER      pause the stream → the meet> prompt
#   roster / tree / mon / net / links / dups / shot /tmp/x.png ...
#   watch 5 info   resume the stream
#   C-b d      detach (service keeps running)
```

It runs the **edge** channel by default (`MEET_EDGE=1` → `--edge`) — the room
is a debugging surface, and fixes land on edge first. Set `MEET_EDGE=0` (e.g.
as an Environment= override in the unit) to follow the default release channel
instead — the monitor then sees exactly what a fresh visitor sees. meet.js uses
a fresh browser context per join, so the choice never sticks across restarts.

## Install (on the pi, from the repo checkout)

```bash
cd ~/projects/gifos && git pull origin main
./test/swarm/monitor/install.sh
```

`install.sh`, `moto-keeper.js` (invoked by `run.sh` every pass) is idempotent and retires the old hand-rolled
`gifos-monitor.service` (a bespoke `monitor.js` under `~/.openclaw`, pre
2026-07-25) if it finds one. Requirements on the box: `tmux`, `node` with
playwright resolvable (meet.js tries `/opt/node22/...`, then `playwright` on
NODE_PATH), and a chromium at `/opt/pw-browsers/...` or via `MEET_CHROME`.

## Files

- `run.sh` — the loop the tmux pane runs: meet.js REPL, auto-`watch` on start,
  rejoin 5s after any exit. stderr → `~/gifos-meet-monitor/stderr.log`.
- `gifos-meet-monitor.service` — oneshot+RemainAfterExit tmux wrapper
  (`ExecStop` kills the session; crash recovery is run.sh's loop).
- `install.sh` — copy unit, daemon-reload, enable, start, retire the old unit.

## Reading the record

```bash
# media outages: peers present but neither connected nor friend-relayed
jq -c 'select((.roster|length) > ([.roster[]|select(.conn or .relay)]|length))' \
  ~/gifos-meet-monitor/snapshots-*.jsonl | tail

# fragmentation: participant counts disagreeing over time
jq -c '{t:._t, p:.participants, in:.inMeeting, occ:.occ, dups:(.dupList|length)}' \
  ~/gifos-meet-monitor/snapshots-$(date +%F).jsonl | tail
```
