# Chrome Dino — gauntlet

**Win:** A stranger who knows chrome://dino uses this copy because it is *always* offline, the high score lives in the GIF, and one invite is a side-by-side run on the same desert.

## Bars

- **ONE:** chrome://dino (Chromium's offline T-Rex). Floor, not ceiling: "as good as" is losing.
- **TWO:** always offline (the joke); high score in the file; Invite is a ghost-dino race with a shared cactus seed. No account, no install, no network.

## Rounds

1. **Vendor** — wayou/t-rex-runner @ 5455bfa4, BSD-3-Clause (Chromium Authors + wayou). Sprites and the three sounds ride as files. Obstacle RNG is seedable; clouds stay random so they cannot desync the course.
2. **Product** — original light desert, tap/space jump, down duck, night invert. Phone JUMP / DUCK. High score in gifos.db (`prefs`, private).
3. **Invite** — each runner owns one `players` row. Shared seed. Ghosts a little ahead or behind. Race bar only when someone else is here.
4. **Icon** — the real sprite, running, toward a cactus, on a sticker card. Reads at 64px.
5. **Cover** — mid-jump over a large cactus, a blue ghost behind, HI 00480 and 00312 spaced like Chrome. Not the blinking start screen.
6. **Listing** — tagline is the GifOS reason in one line. Description leads with always-offline / the file is the save / one invite is a race.

## Remaining gap

Night-mode invert is the runner container, not the whole OS chrome (correct — we are in an iframe). A third racer is a ghost too; this is friends in one desert, not a ladder.
