# 2026-07-30 — phone power tuning: first measured round

Nathan's questions: is 240p a hard floor? can we be smarter about turning
streams on and off? are there loops we run that we don't need? Answers below,
with what is MEASURED separated from what is still THEORY.

## 1. 240p was never a technical floor — it was the last array entry

`LADDER` ended at 240p, so `LADDER[index + tier]` **clamped** there. On a
phone in any 3+ person meeting the power tier was SATURATED: tier 2 already
reached the floor, and 240p is already 15fps, so unplugging changed
**nothing** — battery state had no effect whatsoever. That is why the "on
battery, sending lighter video" notice appeared to lie.

Added two rungs, reachable ONLY by power tier / tune (`rung(n)` still floors
at 240p for room SIZE, so nobody lands here just for being in a big room):

| rung | pixels | fps | kbps |
|---|---|---|---|
| 240p (old floor) | 426x240 = 102k | 15 | 250 |
| **180p** | 320x180 = 58k | 12 | 150 |
| **144p** | 256x144 = 37k | 10 | 100 |

Encoder cost tracks pixels x fps: 240p -> 144p is ~2.8x fewer pixels at 2/3
the frame rate. VERIFIED reachable on the moto (`powTier().rung` read back
`180p` then `144p` live). NOT yet isolated as a power number — see §4.

## 2. Loops we did not need — MEASURED, -21% CPU

Two loops burned cycles regardless of whether anything could use the result.
CPU cycles are watts on a phone.

- **`mosWatchdog`**: a flat **300ms `getStats()` sweep, forever**, on every
  device — 3.3 wakeups/sec even in a 2-person room with no mosaic at all, and
  `getStats()` is among the most expensive calls a WebRTC page makes. Now
  adaptive: 300ms only when a slot is dark or a wake is in flight (when speed
  can actually act), 900ms when a claim has a standby to fail over to (still
  far inside MOS_GRACE 5s, so detection is unaffected), 3s when there is
  nothing watchable. The guarantee is unchanged.
- **Audio meters**: woke 5.5x/sec per participant to decide there was nothing
  to measure. The per-participant analyser read already skipped muted people;
  the WAKEUP did not. An all-muted room (join-quiet is the DEFAULT) now ticks
  at 720ms; one unmuted mic restores the fast beat on the next tick.

**Measured on the moto, same room both windows (MonitorBot second witness:
3 participants, liveVid 1 in each):**

| build | CPU | big cluster | temp |
|---|---|---|---|
| 910 (before) | **56%** | 1766 MHz | 35.0C |
| 911 (after)  | **44%** | 1423 MHz | 34.0C |

-21% CPU and -19% clock for the same work. The governor clocking down is the
honest signal: less demand, not just less measured busy-time.

## 3. Measuring power on this phone: a trap

`current_now` is only the charger top-up SURPLUS while `status` is **5
(FULL)**. When the controller flips to **2 (CHARGING)** — which it does
constantly at 100% during top-off — the same field means battery charge
current and is NOT comparable. My first before/after read 71mA -> 7mA and
looked like a regression; it was a FULL->CHARGING boundary with the charge
counter identical (5,049,000) in both, i.e. no charge actually moved.

**Always compare status-matched windows, or use CPU%/clock, which are clean.**

## 4. What is NOT yet answered

- **The power saving of 180p/144p is unmeasured.** The window where I forced
  144p had the room empty out (2 participants, liveVid 0), so its low CPU
  (25%) cannot be credited to the rung. Needs a re-run with a stable room.
- **Policy**: should a phone on battery ride 180p, and a phone with a LOSING
  charger ride 144p? The rungs exist now; the tier mapping still stops at
  240p for tier 2. Decide with numbers from the re-run.

## 4b. Round 2 — shipped, only partly measured

Four more changes landed (edge build 914):

| change | what it stops doing |
|---|---|
| blur fps cap (Nathan's idea) | Max blur sends 8fps, Min 12 — a blurred feed has no spatial detail to preserve, so paying for temporal detail transmits what the user chose to hide. Makes "No blur" visibly a choice to spend power. |
| blur paint follows the rung | the canvas FILTER ran at a flat 15fps while the encoder was capped as low as 10 — filtering frames that were dropped before the wire |
| still-frame skip (packers) | a composite whose sources have not advanced redrew an identical frame, which was then ENCODED and SHIPPED downstream |
| forensics demand-gating | getStats() on every sender every 10s, forever, for data only diagnostics read |

**Not cleanly measured.** The 914 window read CPU 49% / 1651MHz, but the room
had liveVid **2** where the 910/911 windows had **1** — strictly more decode
work, so it is not comparable to the -21% result above. Verified live:
Max blur -> 8fps, No blur -> 12fps; forensics 0 senders unread, populated
after a read.

**To measure this batch properly**, build a CONTROLLED room (fleet bots with
fixed camera states, one client per box) rather than riding the prod room
whose composition drifts. Every confound so far has come from measuring in a
room I did not control.

## 5. Next candidates (design, not thresholds)

- **Decode-side parking.** The demand machinery (`mx-want`/`mx-idle`) already
  parks SENDERS. Nothing parks a RECEIVER whose tile is a few pixels: on a
  phone the grid tiles are tiny while the stadium composite already carries
  the room. Parking tiles below a size threshold would cut decode — usually
  the biggest single cost on a phone.
- **Composite tick.** Packers repaint on a fixed metronome regardless of
  whether any source advanced. A content-driven tick (repaint only when a
  source frame actually arrived) would idle at zero on a still room.
- **One-encoder fan.** Fans to N row-mates re-encode per peer connection.
  Sending the SAME encoded stream to several peers would collapse N encoder
  sessions to 1 — the MediaCodec session ceiling is a real limit on the g24.
- **`sdnm` mirror hops** are born parked; confirm nothing else pre-negotiates
  hot pipes that nobody demands.
