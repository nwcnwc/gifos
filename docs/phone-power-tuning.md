# Phone power tuning — the sweep harness (2026-07-29)

> **CANDIDATE-LEVER LIST BELOW IS STALE — corrected 2026-08-06 (ce294be).**
> Two of the levers this doc proposes were REFUTED by measurement the
> following day and must not be re-proposed from here:
> - **decode-side parking — a NO-OP.** `UNPAINTED_kbps: 0`. Not small, zero.
>   See `decode-side-parking-is-a-noop-2026-07-31.md`, which also refutes
>   pixel overdraw and leaves "a phone should not be a HEAD" unconfirmed.
> - **the one-encoder fan — the premise is gone.** A g24 runs the whole
>   C-1 = 4 fan in hardware (`CEILING_HIT false`); the "ceiling" was an
>   artifact of headless Chromium having no hardware encoders. Re-scoped
>   into roadmap §9b, where it is what §9a delivers for free.
>
> Surviving levers from this doc: **fan off-phone** (roadmap: "compositor
> duty on phones", a LAW change needing sim-first work and Nathan's sign-off).
> The composite fps split has since SHIPPED (`compFps()` cuts phones to 0.6×
> the base COMP_FPS=8, floor 4; byte-identical frames are skipped).
> The measurements themselves stand.

Nathan's bar: **draining while plugged in is unacceptable.** The g24
measurements (docs/phone-power-scaling-2026-07-29.md) put a phone's meeting
load at ~2.2 W against a 2.5 W real-world USB budget with the CPU pegged at
8 seats — so quality must come down IN BOTH power states, and every further
cut should be chosen by MEASUREMENT on the real phone, not by guess.

## Shipped with this doc

- **Phones are power-tier floor 2 in every state** (was 1): one more LADDER
  rung down, plugged or not. run.html `adapt()`.
- **The `gifos_tune` override surface**: `localStorage gifos_tune =
  '{"shift":1,"fps":15,"aux":500,"kbps":300}'` (or `window.GIFOS_TUNE`) —
  extra ladder shift, hard fps cap, aux/composite ship budget (default 900
  kbps), hard main-bitrate cap. Absent = shipped behavior, so the surface is
  inert for real users. Verify application via `__gifosVideo.powTier()`
  (`.rung`, `.tune`).

## The sweep (run when the phone is NOT hosting a human's meeting)

Instruments: `test/tools/phone-power-log.sh` (10 s JSONL oracle, marker lines
between stages), `test/tools/phone-tune-drive.js` (opens the knob-set in its
OWN tab on the phone against a DEDICATED tuning room — a human's placed tab
is never touched), clip bots for load (REAL Chrome, `--video`, one per
launch; see test/swarm/meet.js).

Per knob-set: marker → `open <room> '<knobs>' --edge` → settle ≥2 min →
sample ≥5 min → `close`. Fixed room size across the whole sweep (4 bots).

First matrix (≈50 min on-device):

| set | knobs | question |
|---|---|---|
| A | `{}` | baseline at the new floor-2 |
| B | `{"shift":1}` | one more rung — resolution vs W |
| C | `{"fps":15}` | frame rate alone — encode W is fps-linear-ish |
| D | `{"aux":500}` | fan/composite budget — the distributor's biggest knob |
| E | `{"aux":350,"fps":15}` | combined floor |
| F | `{"aux":350,"fps":15,"kbps":250}` | everything floored — the survival rung |

Read out with `test/tools/phone-power-analyze.py` per stage window; the
verdict metric is the charger top-up surplus (higher = better) and CPU%.
Watch `debugDump().power` for `limit:'cpu'` and software-encoder impl names —
a knob that moves encode off `cpu`-limited is worth more than its watts.

## Candidate next levers (new code/algos/architectures — measure before shipping)

- **Decode-side parking**: tiles below a visible-size threshold demand-park
  their pipes (the mx-idle machinery already exists — apply it to tiny grid
  tiles on phones; the stadium composite already carries the room anyway).
- **Fan off-phone**: distributor roles (sdm/stg fans) currently land by seat
  arithmetic; a phone-aware compositor-duty law (sim-first, the deacon-death
  survivor) would move the 6-encoder burden to plugged desktops.
- **Composite fps split — SHIPPED**: composites tick at COMP_FPS=8 (the
  Stage strip has its own 20/15/10 ladder), phones in a deep tier run 0.6×
  with a floor of 4 (`compFps()`), and byte-identical frames are skipped —
  the "repaint regardless of content" premise no longer holds.
- **One-encoder fan**: fans to N row-mates re-encode per PC; RTCRtpSender
  cloning the SAME encoded stream (simulcast-style) would collapse N encoder
  sessions to 1 — the MediaCodec session ceiling measured on the g24.
