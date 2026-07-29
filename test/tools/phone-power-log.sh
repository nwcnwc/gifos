#!/bin/bash
# phone-power-log.sh — 10s JSONL power sampler for a USB-tethered Android phone.
# Runs on whatever host has the phone on adb. One line per sample:
#   {"ts", "counter":µAh, "current":µA, "voltage":µV, "level":%, "status":n,
#    "temp":deci°C, "vbus":mV, "ilim":µA, "cpu":busy%, "freqs":[kHz,...]}
# NOTE (2026-07-29, measured): on this phone battery current_now with counter
# FLAT is the charger TOP-UP SURPLUS (input budget minus system load), not the
# system load itself. Input budget = ilim(500mA) × vbus(~5.09V) ≈ 2.5 W.
# Surplus → 0 then counter falling = the G2 cliff.
set -u
DEV=${PHONE_ADB_SERIAL:?set PHONE_ADB_SERIAL}
OUT=${1:?usage: moto-power-log.sh <out.jsonl>}
mkdir -p "$(dirname "$OUT")"
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"marker\":\"logger-start-v2\"}" >> "$OUT"
prev_tot=0; prev_idle=0
while true; do
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  raw=$(adb -s "$DEV" shell '
    cat /sys/class/power_supply/battery/charge_counter /sys/class/power_supply/battery/current_now /sys/class/power_supply/battery/voltage_now 2>/dev/null
    echo ---
    dumpsys battery | grep -E "level|status|temperature"
    echo ---
    cat /sys/class/power_supply/mtk-master-charger/voltage_now /sys/class/power_supply/mtk-master-charger/input_current_limit 2>/dev/null
    echo ---
    head -1 /proc/stat
    echo ---
    cat /sys/devices/system/cpu/cpufreq/policy*/scaling_cur_freq 2>/dev/null
  ' 2>/dev/null | tr -d '\r')
  cc=$(sed -n 1p <<<"$raw"); cur=$(sed -n 2p <<<"$raw"); vol=$(sed -n 3p <<<"$raw")
  lvl=$(awk '/level:/{print $2; exit}' <<<"$raw")
  st=$(awk '/status:/{print $2; exit}' <<<"$raw")
  tmp=$(awk '/temperature:/{print $2; exit}' <<<"$raw")
  vbus=$(awk 'f==2 && /^[0-9]+$/{print; exit} /^---$/{f++}' <<<"$raw")
  ilim=$(awk 'f==2 && /^[0-9]+$/{n++; if(n==2){print; exit}} /^---$/{f++}' <<<"$raw")
  stat=$(awk '/^cpu /{print}' <<<"$raw")
  freqs=$(awk 'f==4 && /^[0-9]+$/{printf "%s%s", s, $1; s=","} /^---$/{f++}' <<<"$raw")
  # busy% from successive /proc/stat cpu lines
  tot=0; idle=0
  if [ -n "$stat" ]; then
    set -- $stat; shift
    i=0; for v in "$@"; do tot=$((tot+v)); i=$((i+1)); [ $i -eq 4 ] && idle=$v; done
  fi
  cpu=null
  if [ "$prev_tot" -gt 0 ] && [ "$tot" -gt "$prev_tot" ]; then
    dt=$((tot-prev_tot)); di=$((idle-prev_idle))
    cpu=$(( (dt-di)*100/dt ))
  fi
  prev_tot=$tot; prev_idle=$idle
  if [ -n "${cc:-}" ] && [ -n "${cur:-}" ]; then
    echo "{\"ts\":\"$ts\",\"counter\":$cc,\"current\":$cur,\"voltage\":$vol,\"level\":${lvl:-null},\"status\":${st:-null},\"temp\":${tmp:-null},\"vbus\":${vbus:-null},\"ilim\":${ilim:-null},\"cpu\":$cpu,\"freqs\":[${freqs:-}]}" >> "$OUT"
  else
    echo "{\"ts\":\"$ts\",\"error\":\"adb-read-failed\"}" >> "$OUT"
  fi
  sleep 10
done
