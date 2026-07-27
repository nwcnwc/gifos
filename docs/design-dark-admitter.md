# Design question: the dark designated-admitter closes the door

**Status: DECIDED — A (Nathan, 2026-07-27).** The one-admitter law stands;
the ~12-15s dark-door window is accepted, and the joining veil gains a
"Waiting for a seat…" countdown from the worst-case bound (195s vouch reap +
seat margin) so a held knocker knows they are not out of luck — shipping
with 0.8.6. Option B below stays as the recorded fallback if the pause ever
matters at product level. Originally written 2026-07-27 out of the 14a
battery hunt (task: "dark designated-admitter closes the door — acceptable?").
Everything below is grounded in shipped code (b2d0e1d, d85c6c0, 6a23358) and
the laws as written (docs/healing-laws.md H7 / H-CHAIN / C3 / D4 / D5).

## The problem, concretely (scenario 14a)

N=2 room: faye (row head, the H7 designated admitter) + bill. Faye goes
radio-dark — no close event, no LEAVE, a zombie transport. Gil knocks.

- H7 names exactly ONE admitter per home cell; gil's cell's admitter is faye.
- H-CHAIN devolves the admission duty to bill (column 1) — but ONLY on
  faye's **confirmed** death (D4: "healers act on CONFIRMED death, not mere
  silence"; the depth rule forbids promotion on anything less).
- So until faye's death is confirmed, every FIND lands on a corpse and gil
  gets NOROOM. The door of a live, healthy-feeling room is CLOSED.

What we shipped during the hunt shortened the dark window a lot: the
starve-edge (mesh-silent ≥12s on a roster-named pair with transport-proof
semantics per 6a23358) fires `onTransportDead`, D5 confirm follows, the
heal-move runs, bill becomes the admitter, gil seats. **Recovery is now ~15s
typical; the fail-tail (~15% of draws >120s) is the F1-family formation gap**
(bill's faye pair-object never formed, so no pair-level edge can fire — see
the 14a dossier v3; candidate one-liner fix: dial/starve from ROSTER, not
occ). This memo is about the LAW question that remains after the tail is
fixed: is a ~12-15s closed door on a dark admitter acceptable, or should
admission fail over faster?

## The options

### A. Status quo (accept ~12-15s; fix the formation-gap tail separately)

The 12s starve threshold IS the failover clock for every duty at once. No
law change. Cost: a knocker in that window sees NOROOM and retries; UX is a
"connecting…" pause, not a failure, as long as the client keeps re-FINDing.

### B. Admission-on-suspicion (narrow H-CHAIN carve-out) — recommended shape
   if faster matters

Let the level-1 devolvee (column 1, a first-hand row-mate) SERVE ADMISSION —
and only admission — while the head is starve-SUSPECT (its own DC to the
head silent, threshold unchanged) rather than waiting for confirmed death.

The legal argument: the depth rule exists to stop hearsay PROMOTION into a
possibly-live seat. Admission never touches the head's seat — it fills a
*different, confirmed-empty* cell. The laws already absorb transient
double-claims (C3 confirmed-empty-only fills + E2 lower-id-wins), so the
worst case — head was alive-but-slow and both admit — is one loser
re-FINDing, the same duplicate-absorption path every fill already has. The
carve-out generalizes cleanly: **duties that create state in EMPTY cells may
devolve on first-hand suspicion; duties that overwrite a possibly-live seat
never do.** D4 stays intact for healing; the suspicion is the devolvee's OWN
starved link (first-hand), never gossip — the depth rule's hearsay ban is
untouched.

Door reopens at the suspicion threshold (~12s) minus no confirm/heal-move
wait — in practice the same clock as A today, BUT it decouples the door from
the heal: confirm + heal-move can take their time (D5's multi-stage budget)
while newcomers seat. The real win shows in the tail cases where confirm is
slow.

### C. Any live S1 seat serves entry while the head is translost-pending

Breaks C3's one-admitter discipline outright (races on the same target cell
from seats that share no first-hand view). The duplicate-absorption
machinery would be carrying steady-state load instead of rare transients.
Not recommended; listed for completeness.

## The human overlay (Nathan, 2026-07-27) — applies to EVERY option

A phone user facing an ambiguous state closes the tab: a knocker staring
at silence for 12-15s is a bailed knocker, whatever the mesh eventually
does. So whichever option wins, the DOOR UX must look deliberate within
a couple of seconds — an honest "getting you in…" state on the knock
path — and the close-and-reopen path must stay instant and ghost-free,
because that is the retry a human will actually perform. The law options
below buy mesh-side truth; only the UI buys patience.

## Recommendation

A now, B if the door pause ever matters at product level. Concretely: fix
the formation-gap tail first (it dominates the observed pain and is a bug,
not a law), re-measure 14a, and only take B if ~12-15s doors are still
user-visible pain. B is the only faster option that keeps D4/C3/depth-rule
semantics honest, and it should land sim-first (mesh.cpp scenario: dark
head + knock storm + head-wakes-late glare) before mesh.js.

**Per the peer session's constraint (2026-07-27): no threshold changes —
the 12s starve clock stays as-is in every option here.**

## What this touches if B is taken

- `test/sim/mesh.cpp` — suspicion-admission scenario + glare case (source of
  truth first).
- `site/js/mesh.js` `serveFind` — the devolvee walk already exists
  (H-CHAIN "admission devolution on vacated admitter"); B extends its gate
  from occ-EMPTY/confirmed to starve-suspect with an unchanged walk order.
- `docs/healing-laws.md` — H-CHAIN gains the empty-cell/occupied-seat duty
  distinction, one paragraph.
- Battery: 14a stays the guard; add a "head wakes late" scenario asserting
  the duplicate-admission absorption (both admissions resolve, loser
  re-seats, no ghost).
