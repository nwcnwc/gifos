# Thumb Sprint

Original first-party GifOS game. Mash to run a sticker down a track. Lanes
sit side by side. First across the tape wins. There is no race server: a
meeting link is the starting gun, and the finish lives in the file.

```
index.html      shell: track, mash pad, how-to
style.css       dark #0a0a0f, phone-first mash target
race.js         rules (false start, taps → position, finish, host-only race row)
app.js          canvas track, solo ghost/cpu, versus, photo finish
icon.mjs        procedural sprinting sticker + 1200×720 cover
build.mjs       packs site/apps/thumb-sprint/thumb-sprint.gif
```

Classic scripts only. GifOS drops `type=module`.

## Rules

- Position is `taps × TAP_GAIN`, capped at `finishDistance` (100).
- Countdown is host `startAt`. A tap with `now < startAt` is a **false start**:
  the sticker **goes back** to 0 and stalls until `startAt + 900ms`.
- First lane to `finishDistance` (earliest `finishedAt`) wins.
- Photo finish is a **local** canvas loop of the last second of positions.
  Hot rows stay lean: tap-count and position, never frame bitmaps.

## Solo

- **Ghost** — a recording of your best time, replayed in the next lane.
- **Computer** — a seeded cadence around 7–8 taps/s with jitter. Beatable.

Best time is private (`save`). Close the app and it is still in the icon.

## Versus

Invite is **OS chrome** — the bar above the app. This game does not draw its
own invite button (`id="invite"` is forbidden).

Each person writes **only their own** `lanes` row (`id = me`, taps + position).
The host alone writes the `race` row (`seed`, `startAt`, false-start flags,
finish order). `race` is **read-only** for guests, so a second racer cannot
put that row. 2–4 seated lanes.

## capabilities

| capability | why |
|---|---|
| `db` | Private best-time, shared race + per-lane rows. |
| `multiplayer` | One invite, side-by-side lanes. Needs nothing newer than the App Store, so `minBuild` is **947**. |

No `network`, no `wasm`, no pointer lock. Stickers are procedural; nothing is
fetched.

## Building

```bash
node apps/thumb-sprint/build.mjs
```

Writes `site/apps/thumb-sprint/thumb-sprint.gif` and `apps/thumb-sprint/screenshot.png`.
Do not run `scripts/build-app-catalog.mjs` from this change — `index.json` is
owned elsewhere.

## Licence

MIT. Author GifOS.
