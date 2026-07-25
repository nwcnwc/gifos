#!/bin/bash
# install.sh — install/refresh the gifos-meet-monitor systemd user service on
# THIS machine (run it on the raspberrypi from the repo checkout). Idempotent.
# Retires the old bespoke gifos-monitor.service if present.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/.config/systemd/user"
cp "$HERE/gifos-meet-monitor.service" "$HOME/.config/systemd/user/"
chmod +x "$HERE/run.sh"
systemctl --user daemon-reload
# the old hand-rolled monitor (pre-2026-07-25) — same job, worse tooling
if systemctl --user list-unit-files | grep -q '^gifos-monitor.service'; then
  systemctl --user disable --now gifos-monitor.service || true
  echo "[install] retired old gifos-monitor.service"
fi
systemctl --user enable --now gifos-meet-monitor.service
sleep 2
systemctl --user --no-pager --lines=0 status gifos-meet-monitor.service || true
echo
echo "[install] attach with: tmux attach -t gifos-meet   (ENTER = prompt, 'watch' = stream, C-b d = detach)"
echo "[install] snapshots:   ~/gifos-meet-monitor/snapshots-YYYY-MM-DD.jsonl"
