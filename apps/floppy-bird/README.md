# Floppy Bird

Tap to flap between the pipes. Send the meeting link and it becomes a race:
everyone flies the same pipes, you see the other bird as a ghost, and the
one who goes farthest wins.

An unofficial port of **[Floppy Bird](https://github.com/nebez/floppybird)**
by nebez (Apache-2.0). Upstream is a solo tap-flap game in HTML, CSS and
classic scripts. This directory is the GifOS wrap: persistence, a shared
pipe seed, and the race. The invite button is OS chrome — the app never
draws one.

```
index.html          the original shell, no CDN, no analytics
style.css           race HUD, phone fill
mp.js               prefs, seeded pipes, ghosts, the race
icon.mjs            procedural icon + 1200×720 cover
vendor.mjs          rebuilds vendor/* from the pin. The only net step.
build.mjs           packs the GIF into site/apps/floppy-bird/floppy-bird.gif
vendor/             GENERATED. Pinned upstream js/css/png/ogg. Never edit.
COPYING.txt         Apache-2.0 (Floppy Bird's)
NOTICE              unofficial-port addendum + bundled MIT notices
```

## Why this can run as a GifOS app

Upstream is already classic scripts plus images. GifOS's runtime inlines
`<script src>` and rewrites static `src`/`href`, so the scripts ride in as-is.
Background pictures in CSS and the JS-constructed score digits need data
URLs (a srcdoc iframe has no relative files), which `vendor.mjs` bakes in.
Cookies and `Math.random` pipes are the only seams: highscore goes to a
private collection, pipe heights come from a seed on each player's own row.

## capabilities

| capability | why |
|---|---|
| `db` | Highscore in `prefs` (private). Live race state in `room` (read-write). |
| `multiplayer` | The room. The invite link is the race. |

No `network`. Needs nothing newer than the App Store itself, so `minBuild`
is **947**.

## The race

There is no server. Each bird writes only its own row: `y`, `alive`,
`distance`, and the `seed` it is flying. A joiner who sees someone already
in the air copies that seed so the pipes match. Ghosts are extra birds
offset by the difference in distance. First to hit a pipe is losing;
farthest when the dust settles wins. Playing alone never waits on a room.

## Building

```bash
node apps/floppy-bird/vendor.mjs   # only when moving the upstream pin (needs net)
node apps/floppy-bird/build.mjs    # -> site/apps/floppy-bird/floppy-bird.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

Apache-2.0, Nebez Briefkani. The notice is packed **inside the GIF** as
`COPYING.txt` and `NOTICE` as well as living here, because a copy of this
app that someone was handed is a distribution of that work. Art and sound
are from Dong Nguyen / .GEARS — see NOTICE. jQuery, jQuery Transit and Buzz
are MIT, attributed in NOTICE. No upstream PR: this is an unofficial port.
