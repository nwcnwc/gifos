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
| P1 | the corridor — DDA, wall/floor/ceiling textures, lights, fog | |
| P2 | the things — sprite figures, walk, hurt, death | |
| P3 | the shotgun — sprite, bob, pump, muzzle flash | |
| P4 | feel + HUD — status bar, damage, shake, sound | |
| P5 | the icon (icon.mjs) | |
| P6 | the store art (screenshot.png) | |
| P7 | the listing copy | |
| P8 | platform: save, invite, offline | |
