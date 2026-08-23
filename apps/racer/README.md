# Racer

An Outrun-style pseudo-3D racer that runs as an ordinary sandboxed GifOS app.
Solo, you drive a coastal road against traffic; send the invite and the same
road has everyone else on it as cars you can see and pass. The host starts a
race; finish times land on a board.

The engine is **[JavaScript Racer](https://github.com/jakesgordon/javascript-racer)**
by Jake Gordon — MIT, the v4 "final" loop. This directory is the GifOS port:
the shell around it, the thumb controls, and the multiplayer, none of which
upstream has. Upstream's README says mobile is unplayable; the pad and GO
button are why this copy is a phone game.

```
index.html           the shell: canvas, HUD, gate, touch, the finish board
style.css            gate / touch / HUD / board
game.js              v4 loop, extracted, with a seeded track and remote cars
net.js               transport — presence, the race record, the board
touch.js             steer pad + GO / BRAKE
boot.js              GifOS glue: overlays, host Start, first paint
icon.mjs             procedural app icon + 1200×720 cover
vendor/common.js     Jake Gordon's helpers, patched (see the file header)
vendor/COPYING.txt   MIT notice, packed inside the GIF
images/sprites.png   upstream sprite sheet
images/background.png upstream sky / hills / trees
build.mjs            packs all of the above into site/apps/racer/racer.gif
```

## capabilities

| capability | why |
|---|---|
| `db` | Settings in a `private` collection; player state in a `read-write` one; the race record is `read-only` so only the host can start. |
| `multiplayer` | The room. |

No `pointer` (keys + a thumb pad, no lock), no `network`, no `wasm`, no
`fullscreen`. `minBuild` is **947**, the store floor — nothing here is newer.

Invite is OS chrome. This app does not draw its own "send a link" button.

## The port, in three parts

**Touch.** Upstream is arrow keys. `touch.js` writes a −1…1 steer axis and
hold-to-go / hold-to-brake into the same flags the loop already has, and is
shown only after a real `touchstart` so a touchscreen laptop keeps the
keyboard game.

**The shared road.** The track is built from a seeded RNG (`0x52414345`), so
every client plants the same palms and the same traffic with nothing sent.
Remote players are extra sprites drawn on the segment they currently sit on —
never inserted into the AI car list, which would steer around them as if they
were traffic.

**A race with no server.** Each player owns exactly one `players` row and
only ever writes that row (position, speed, lap, finish time). The host
writes `{ id: 'race', startedAt }` on a `read-only` collection. The board is
assembled by reading everyone else's row. Nobody writes anybody else's.

## What is not in this copy

- **Music.** Upstream licensed those tracks only for the original project.
- **The tweak UI / FPS box.** Resolution and draw distance pick themselves
  from the screen; there is no mr.doob stats panel.
- **Pointer lock.** A racer is not a first-person shooter.

## Honest limits

- **6 Hz.** Remote cars are interpolated ~166 ms in the past so they glide.
  Comfortable up to about six players.
- **Trusting clients.** You publish your own finish time. A modified client
  could lie. The room is people you sent a link to.
- **One lap.** A race is one trip around the v4 track.
- **Placeholder sprites.** Upstream borrowed them from Genesis Outrun as
  teaching examples; they travel because they are the game.

## Building

```bash
node apps/racer/build.mjs       # -> site/apps/racer/racer.gif
```

Do not edit `site/versions/`. Do not bump `GIFOS_VERSION`. Catalog refresh
and signing are a separate, later step.

## Licences

MIT, Jake Gordon, packed **inside** the GIF as `COPYING.txt` as well as
living here, because a copy of this app that someone was handed is a
distribution of the work.
