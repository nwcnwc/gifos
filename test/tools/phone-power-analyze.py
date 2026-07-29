#!/usr/bin/env python3
"""phone-power-analyze.py — per-stage power stats from the phone-power JSONL.

Usage: analyze.py power.jsonl 'label=START..END' ...   (times UTC HH:MM or HH:MM:SS)
Watts = |current_now| * voltage_now (µA * µV → W). Counter slope in µAh/min
over the window (0 = healthy plugged-in; negative = G2 drain).
"""
import json, sys, datetime as dt

path, specs = sys.argv[1], sys.argv[2:]
rows = []
for line in open(path):
    try: d = json.loads(line)
    except ValueError: continue
    if 'counter' not in d: continue
    ts = dt.datetime.strptime(d['ts'], '%Y-%m-%dT%H:%M:%SZ')
    rows.append((ts, d))

def at(hms):
    parts = [int(x) for x in hms.split(':')]
    base = rows[0][0].replace(hour=parts[0], minute=parts[1],
                              second=parts[2] if len(parts) > 2 else 0)
    return base

print(f"{'stage':>14} {'n':>4} {'mA(mean)':>9} {'mA(sd)':>7} {'W(mean)':>8} "
      f"{'ctr-slope':>10} {'temp°C':>7}")
for spec in specs:
    label, rng = spec.split('=', 1)
    a, b = [at(x) for x in rng.split('..')]
    w = [(ts, d) for ts, d in rows if a <= ts <= b]
    if len(w) < 2:
        print(f"{label:>14}  (no samples)"); continue
    ma = [abs(d['current']) / 1000 for _, d in w]
    watts = [abs(d['current']) / 1e6 * d['voltage'] / 1e6 for _, d in w]
    n = len(ma)
    mean = sum(ma) / n
    sd = (sum((x - mean) ** 2 for x in ma) / n) ** 0.5
    mins = (w[-1][0] - w[0][0]).total_seconds() / 60
    slope = (w[-1][1]['counter'] - w[0][1]['counter']) / mins if mins else 0
    temp = w[-1][1]['temp'] / 10
    print(f"{label:>14} {n:>4} {mean:>9.1f} {sd:>7.1f} {sum(watts)/n:>8.3f} "
          f"{slope:>10.1f} {temp:>7.1f}")
