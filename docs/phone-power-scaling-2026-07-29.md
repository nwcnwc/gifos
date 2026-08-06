# 2026-07-29 — phone power scaling vs participant count (moto g24, prod room)

> **MEASUREMENT RECORD — no bug to fix; re-checked 2026-08-06 (ce294be).**
> Kept for the measurement convention it pins down (`current_now` reads the
> charger surplus, not the draw) and for one observation that still has no
> home: **crossing into 2 rows is a power regime that did not revert** —
> compaction never pulled that attendee back into row 0 despite 4 free seats
> there for >8 minutes. If that reproduces, it is a compaction bug, not a
> power one.

The question: how does a low-end phone's power consumption grow as talking-head
participants are added to its meeting, and does it ever cross into the G2
plugged-in-death mode (net battery drain while charging)?

Method: the phone sat in prod room `test` (edge 901) on a 2.5 W USB source
(500 mA negotiated @ ~5.03 V VBUS). `test/tools/phone-power-log.sh` sampled
every 10 s; clip bots (`--video`, H.264 clip pack — REAL Chrome required,
playwright chromium can't decode/produce the clips) were added one at a time
from one box, ~6–7 min per stage. Room composition per window was
cross-checked against the monitor's snapshots.

## The measurement convention (this is the part that bites)

On this MTK phone, battery `current_now` with a flat charge counter is the
charger's **top-up surplus** — the slice of the USB budget left over after the
system takes what it needs — NOT the system load. (Proof: adding load made
|current_now| FALL while temp rose and the counter stayed flat.) So the load
curve reads *inverted*: surplus falling toward 0 = system eating the whole
USB budget. Below "surplus" = mean |battery current_now| over the window.

## The curve

| window                | surplus mA | ~system W (of 2.5 W budget) | CPU  | big-cluster clock |
|-----------------------|-----------:|----------------------------:|-----:|------------------:|
| 4 people (baseline)   |        226 |                        ~1.5 |  n/a |               n/a |
| 5 (+bot)              |        136 |                        ~1.9 |  n/a |               n/a |
| 6 (+bot)              |    171(sd102)|                      ~1.7 |  n/a |               n/a |
| 6 + Stage active      |         81 |                        ~2.1 |  n/a |               n/a |
| 6 (bots swap)         |         78 |                        ~2.2 |  78% |         1.625 GHz |
| 8 (+bot)              |         63 |                        ~2.2 |  94% |   1.375 GHz ↓throttle |
| 8 (+bot, max)         |         67 |                        ~2.2 |  95% |         1.375 GHz |
| teardown → 4 people   |         67 |                        ~2.2 |  76% |         1.625 GHz |

(~system W ≈ 2.5 W input budget − surplus×V<sub>bat</sub>; treat as ±0.2 W.)

## Findings

1. **No G2 on this phone: the charge counter did not move one µAh in 80
   minutes** (5,049,000 µAh flat), through 8 participants, an active Stage,
   and provider-churn storms. On a 2.5 W source the g24 saturates its CPU
   *before* it can out-eat the budget.
2. **The real cliff is CPU, not power.** ~0.1–0.45 W per added participant
   until ~6 seats, then the curve flattens because the SoC is pegged: 94–95%
   busy at 8 seats WITH the governor down-clocking 1.625→1.375 GHz. Past this
   point extra participants cost frame rate / decode quality, not watts.
   At max load the phone ran 17 concurrent video RTP streams (6 decode,
   6 encoding, 5 idle-at-0-bytes fans — see the fan-liveness bug doc from the
   same session).
3. **The Stage costs ~2 bots.** Activating the Stage at 6 seats moved the
   surplus 170→81 mA — comparable to adding two more talking heads.
4. **Battery status is a useful tripwire**: it flipped FULL→CHARGING at ~6
   seats (the battery dipped under float as the system squeezed it) — a cheap
   early-warning signal exposed in `dumpsys battery`, well before any counter
   movement.
5. **Crossing into 2 rows is a power regime change that does not revert.**
   After teardown back to the baseline HEADCOUNT (4), system load stayed at
   ~2.2 W / 76% CPU (vs ~1.5 W baseline) because one attendee remained seated
   in row 1: the multi-row composite machinery (stadium production + fans)
   stays on for a single row-1 occupant. Also: compaction did NOT pull that
   attendee back into row 0 despite 4 free seats there for >8 min.
6. **A REAL phone on a weak charger DOES drain**: during the same session the
   (non-instrumented) attendee's phone went 41%→33% in ~30 min while plugged
   in, at 6 seats + Stage. The G2 mode is alive for chargers below the load
   line; the g24 dodged it here only because its ceiling is compute-bound at
   ~2.2 W.

## Raw data

JSONL (10 s cadence: counter/current/voltage/level/status/temp + vbus/ilim +
cpu%/cluster clocks, with stage-transition marker lines) archived on the
measurement host; windows and stats reproducible with
`test/tools/phone-power-analyze.py <jsonl> 'label=HH:MM..HH:MM' ...`.

Related: docs/bugs-2026-07-29-media-fan-liveness.md (4 media-plane bugs
observed live during this experiment).
