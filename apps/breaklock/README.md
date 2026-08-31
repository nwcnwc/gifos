# BreakLock

A 3×3 Android pattern lock scored like Mastermind, running as an ordinary
sandboxed GifOS app. Solo it is maxwellito's BreakLock. Send the invite and
you draw a secret; they have to crack it.

The engine is **[BreakLock](https://github.com/maxwellito/breaklock)** by
maxwellito — MIT, a hybrid of Mastermind and the Android lock. This directory
is the GifOS port: a classic-script shell around the pattern model and the
SVG lock, streaks in the file, and the extra setter/cracker room. Upstream
has no networking.

```
index.html          menu, lock, history, summary
style.css           original black / white / teal, no webfont
vendor/pattern.js   the combination + Mastermind compare
vendor/lock.js      pointer drawing (upstream was touch + mouse)
net.js              I set a pattern, you crack it
boot.js             modes, stats, wiring
icon.mjs            a pattern being drawn, then pegs
build.mjs           packs site/apps/breaklock/breaklock.gif
```

## Why this can run as a GifOS app

Upstream is webpack, SCSS, a Roboto Mono webfont and a service worker. The
sandbox cannot fetch any of that, and GifOS inlines `<script src>` as classic
scripts, so the port is the same 3×3 rules without the bundler. `connect-src
'none'` then costs it nothing.

## capabilities

| capability | why |
|---|---|
| `db` | Streak / bests / a solo lock in progress in a `private` collection; the live secret on `match`; each player writes only their own `players` row. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/breaklock/build.mjs   # -> site/apps/breaklock/breaklock.gif
```

## Licence

MIT, maxwellito. The notice is packed **inside the GIF** as
`COPYING-breaklock.txt` as well as living here, because a copy of this app
that someone was handed is a distribution of that work.
