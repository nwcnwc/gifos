# Handoff 2026-08-04 (evening) — the scale pursuit moves machines

Context: this work ran on the Pi (which also hosts the meet monitor and the
trading experiment; it is about to be stressed and rebooted overnight). The
pursuit continues on another machine. Everything needed is in the repo —
this doc is the pointer map plus the working state that was session-local.

## Read these first, in order

1. `docs/scale-audit-2026-08-04.md` — the four violations (V1 status flood,
   V2 O(N) directory, V3 dial-everyone, V4 join stall), the rollup design
   sketch, and the V4 experiment log INCLUDING two retracted hypotheses
   with their measurements. The V4 sections are the live work front.
2. `docs/seating-under-flap-2026-08-04.md` — the plane incident that
   started all this (fixed: ENTRY RESUME in both twins, shipped).

## Where the live work stopped (V4 — the dup mint)

The join stall at N≥3000 is a duplicate-seat war. Established with the
`MESH_DUPLOG` take()-conflict logger (committed, env-gated):

- First mints from tick 27 are ORDINARY admission, two DIFFERENT placers
  per cell (0/1.4 placers 5 vs 0; 0/2.1 placers 7 vs 5). Resurrection and
  packs are NOT the primary mint (three S5-strict gates tried, measured
  WORSE — 344 vs 155 dups at t600 — and reverted; log in the audit doc).
- Downstream: dup wars → evictions → rejoin storm → admission descends to
  depth 12–13 → the uint32 path overflow wall (6^13 > 2^32) silently
  aliases cells in the C++ sim ONLY (JS Numbers don't overflow — the twins
  diverge). A LOUD depth clamp is wanted regardless of the mint fix.

**The prime suspect (untested):** stale in-flight FINDs meeting the 03c
knock-is-evidence phantom clearing. A FIND forwards hop-to-hop with
ttl=200; under storm the seeker SEATS while stale copies still circulate;
a greeter serving a stale copy then clears the seeker's own fresh seat as
"phantom" (the rule assumes a seeker at the door is not seated) and
re-admits the cell → dup.

**The next experiment, ready to run:**
1. Tag every PLACE with its admit call-site (extend the DUPMINT log:
   S1-designated / S1-fallthrough / resurrection / deep-firstFree /
   compaction), and add a matching env-gated log line at the 03c
   phantom-clear site(s) (search mesh_seat.inc for the knock-is-evidence
   clearing; JS twin: mesh.js serveFind "knock-is-evidence").
2. Run: build `g++ -O2 -std=c++17 -o mesh-sim test/sim/mesh.cpp`, then
   `MESH_DUPLOG=1 ./mesh-sim --service` with stdin:
   `det 1` / `init 3000` / `converge 600` / `state`. (~30 s.)
3. Correlate: do phantom-clears on just-seated cells precede the mints?
4. If yes, the fix shape: FINDs carry an issue tick; knock-is-evidence
   refuses to treat occ entries as stale on evidence older than a seating
   round-trip. One law change, both twins, sim-verified in minutes.

## The sim REPL (no rebuild needed for diagnosis)

`./mesh-sim --service` reads ops from stdin: `det 1`, `init N`,
`joinmode <window W|burst|batch K E|serial E>`, `compacton 0|1`,
`converge <cap>`, `state`, `dups`, `bad`, `seat <id>`, `hist`, `relay`.
`--det` for batch mode. N=3000 stalls by tick ~600 (fast to reproduce);
N=2000 converges @5504 (the regression control). Full runs at N≥5000 take
30–50 min — use the REPL with small converge caps instead.

## Task queue as it stood (session-local list, re-create as needed)

1. DONE — diagnose the join stall (audit doc carries it).
2. IN PROGRESS — fix the dup mint (state above). THE KEYSTONE.
3. Pending — permanent join gate above the collapse threshold (N=5000)
   once it converges fast; the sweep gates only N=800 today.
4. Pending — write the scalability law + digest law into healing-laws.md.
5. Pending — V1: digest rollups + scoped status pulse (design sketched in
   the audit doc, migration table included).
6. Pending — V2/V3: dial-set gate + statusOf cap (run.html; another agent
   was actively editing run.html/desktop.js — pull before touching).
7. Pending — full verification pass; update audit doc statuses.

## Machine notes

- The Pi keeps: the meet monitor (systemd, survives reboots), the moto
  keeper (the phone is USB-attached THERE — moto work cannot move), the
  trading experiment. Reboots do not endanger the mesh work: everything
  is committed and pushed through `8de88e0`.
- Entry-resume A/B and all V4 numbers were measured on the Pi (~45–120
  ticks/s). A faster machine changes wall-clock, not tick counts — tick
  numbers in the docs remain comparable; seconds do not.
- Another agent shares the repo working dir ON THE PI with uncommitted
  changes to site/js/desktop.js and test/browser/e2e-api.js. Do not sweep
  those into commits if working on the Pi clone; a fresh clone on the new
  machine is clean by construction.

## Unfinished work sitting in the PI worktree (decide its fate)

Uncommitted on the Pi clone (`/home/nathan/projects/gifos`), author
unknown (the other agent's session), surviving reboots but committed by
nobody:

- `site/js/desktop.js` — DELETES the whole password-reveal EYE helper
  (`pwEye`, the PWEYE_SVG, and the focusin delegate; ~38 lines at ~1671),
  which commit `a8e7091` ("the password EYE's stranded half") added the
  same day. One more deletion at ~2280.
- `test/browser/e2e-api.js` — DELETES the matching assertions ("every
  Settings key field wears the password eye", reveal/re-hide, the
  fresh-row focusin leg).

Code and tests removed TOGETHER = it reads as a deliberate revert
mid-flight, not an accident. Plausible motive (unverified): the desktop's
Settings fields may already receive the GENERIC eye from run.html's own
focusin delegate, making the desktop copy mint a SECOND button per field.

How to decide (10 minutes, on any machine):
1. Load the desktop page, open Settings, focus an API key field. Count
   eye buttons per password field and note which file's delegate made
   them (`__pwEye` marks, `pweye-` id prefix).
2. TWO eyes → the deletion is a dedup fix: commit BOTH file changes
   together with a message saying exactly that, and keep e2e-video's
   run.html-side eye guard as the sole guard.
3. ONE eye, minted by desktop.js → the deletion would strip password
   reveal from the desktop: restore the worktree (`git checkout -- <both
   files>`) and note why.
4. Either way, do not let it sit: an uncommitted coherent change is how
   a8e7091's own commit message says this bug family started ("it once
   sat uncommitted while the run.html half shipped").
