# Gauntlet: Backdooms

Bar ONE: **DOOM (1993)** — named by the user, and the right floor: the upstream
project's own README says it is "inspired by DOOM 1993 and The Backrooms".
Bar TWO: the platform (offline, the file is the save, one link is multiplayer).

## Round 0 — the research: does the original really look this bad?

No. It looks BAD, but it looks bad in a way that still READS, and our port
broke the one thing it had.

Upstream (`THE-BACKDOOMS.html`, commit ed2dd50) draws walls as
`rgb(g,g,g)` with `g = min(255, 200/d)` — **pure greyscale** — on a **pure
black background**. It never draws a floor or a ceiling at all. So the
corridor is a bright grey wall falling off to black, and against black you can
read the geometry instantly: wall on the left, opening ahead, something in the
dark.

The GifOS port added the Backrooms mustard: yellow walls, a yellow floor, a
yellow ceiling. Every one of them in the same hue, all flat, none textured, and
the floor/ceiling faked as a per-column vertical gradient keyed off the WALL
distance — which is where the giant flat triangles in the cover come from.
Result: yellow-on-yellow-on-yellow with no contrast anywhere. Legibility went
DOWN. Verified by driving both builds and screenshotting them side by side.

So the honest verdict is not "the original was ugly too". It is: **we took a
crude-but-legible thing and made it crude and illegible.** That is the debt
this run pays off.

### What DOOM has that neither build has

1. Textured walls — wallpaper, a chair rail, a baseboard. Horizontal lines at a
   fixed height are what make a corridor's perspective read.
2. A real floor and ceiling, cast in perspective. Not gradient wedges.
3. Fake contrast — N/S walls shaded differently from E/W — so corners exist.
4. Light diminishing to black with distance. Depth cue #1.
5. Sprite monsters with a silhouette, walk frames, and a death.
6. A weapon sprite that bobs, fires, and lights the room.
7. A status bar you can read at a glance.

## Round 1 — "I kept randomly falling with no clue why"

Reported by the user about the pre-run build, and it reproduces exactly. Four
things stacked:

1. **The drain was ~62 HP a second, per thing.** `tickEnemies` ran its enemy
   loop INSIDE the per-frame loop, and any enemy within 0.5 units did
   `hp--` every 16 ms step. Both things you wake next to were 2.5 metres away
   and walked straight in, so at contact you were taking about **125 HP a
   second — dead in under a second** from full health.
2. **There was no health readout.** `style.css` had `#hud { display: none }`,
   so the entire HTML HUD never rendered. The only health signal was a red bar
   drawn at canvas coordinates (10, 10) of a 320x240 buffer that
   `object-fit: fill` then stretched across the whole window: a thin red smear
   in the corner, with no number.
3. **The damage flash was the same variable as the muzzle flash.** One `flash`
   served both, so "something is eating you" and "you pulled the trigger"
   rendered as the identical 2-frame orange wash.
4. **You could not see the attacker.** At 0.5 units a maroon rectangle fills
   the screen, and the flat mustard-on-mustard renderer gave it no edge.

So: under a second to live, no number, a warning that looked like your own
gunshot, no sound, and an attacker that was an unreadable slab. "Randomly
falling with no clue why" is the correct description of that.

Fixed across the run: 6 damage per 950 ms per thing (about a tenth of the old
rate), two seconds of grace at spawn, a HEALTH number in real DOM that throbs
under 30, a grunt on the hit, and a red arc that POINTS at whatever bit you.

## Pieces

| # | piece | state |
| - | ----- | ----- |
| P1 | the corridor — DDA, wall/floor/ceiling textures, lights, fog | done |
| P2 | the things — sprite figures, walk, hurt, death, corpses | done |
| P3 | the shotgun — sprite, bob, pump, muzzle flash | done |
| P4 | feel + HUD — status bar, damage direction, shake, sound | done |
| P5 | the icon (icon.mjs) — its own raycaster | done |
| P6 | the store art — a REAL captured frame | done |
| P7 | the listing copy | done |
| P8 | platform: save, invite, offline, sandbox boot | done |

## Round 2 — the critics

Three sub-agents with fresh context, none of which read the code's reasoning.

**Phone (real touch, 390x844 and 844x390).** Its headline was right and it was
structural: six runs, no input, dead at 7.3/7.4/7.4/7.4/7.4/7.4 seconds — the
same ladder to the tick. Playing perfectly bought 13 seconds and one kill.
Also: the look surface began at 40% of the width so the whole left side of the
screen was dead to both looking and moving; the stick was a fixed pad a thumb
could not find by feel; FIRE did not repeat; and `max(14px, env(safe-area))`
lands the HUD exactly ON the home indicator rather than clear of it. All fixed.
What it could not fault: 59.8 fps portrait / 59.2 landscape, clean mid-game
rotation, every hit target over 44x44.

**Visual, against DOOM (1993).** Called the monster and the weapon losses
against the 1993 bar, and the corridor and the lighting wins. Its single
biggest gap was the level, and it proved it with a number: on a 70x70 scan the
longest run of open floor with a wall on both sides was SIX tiles, in either
axis, anywhere. Six is the block width — with crossings every seven cells the
perpendicular hall cuts the wall open at every junction, so an endless hall
was structurally impossible. Fixed by a twelve-cell lattice period; measured
ten now, on every seed. It also caught that NOTHING MOVED when you stood
still — two frames 120 ms apart were byte-identical, in a game whose setting
is famous for a stuttering fluorescent tube.

One claim from that report was investigated and REJECTED: "sprites are lit on
a third of the falloff curve of the walls". Both go through the same `fog()`
with the same perpendicular distance. The measurement was a mean over a
bounding box, which at range is mostly the wall behind the sprite plus its own
eye-glow texels.

## Measurements that decided things

| question | answer |
| --- | --- |
| longest fully-walled corridor, before / after | 6 tiles / 10 tiles |
| passive run (no input at all) | dead at 10.2 s |
| skilled play, before the balance work | 13 s, 1 kill |
| skilled play, after | survives a 180 s cap, 23 kills, ends on 0 shells |
| frame rate on a phone viewport | 59.8 fps portrait, 59.2 landscape |
| App GIF size | ~257 KB |

## Round 3 — the thing a bot found that no critic did

Left a competent bot in a room for three minutes after the level rewrite: it
finished on 100 health, UNTOUCHED, with everything hunting it pressed against
a wall four metres away. Walking straight at the player is fine on the open
plain upstream generated and useless in a building — at an inside corner both
axes are blocked and a thing stands there for good. Making solid mass the
commonest block had quietly re-created the bug this whole run opened with:
things that cannot reach you. A blocked thing now picks a side and slides
along the wall. Score on the same bot went 3 to 23, and its health finally
moved.

Worth writing down as a method note: two harsh critics with fresh context
missed this, because it does not show up in a screenshot and it does not show
up in twenty seconds of play. It took leaving something running.

## Still open

- The monster is ONE front-facing billboard used for all 360 degrees. DOOM gave
  its imps eight rotations, so their facing told you whether they had seen you.
  This is the largest remaining gap against bar ONE.
- There is one floor texture and one ceiling texture (walls have three). The
  halls still have no second kind of object in them — no sign, no door, no
  vent, nothing to remember a place by, in a game about being lost.
- Portrait keeps a sane horizontal field of view now, but pays for it in
  ceiling. The start card says to turn the phone; a letterboxed portrait
  layout with the controls below the view would be better.
- You can outrun everything. The player moves 6.25 units a second and the
  things about 1.9, so a player who only retreats is never caught — the run
  ends when the shells do, not when they reach you. Spawning happens behind a
  moving player, which is the pressure that stops it being free, but the
  honest answer is level geometry: somewhere to be cornered.
