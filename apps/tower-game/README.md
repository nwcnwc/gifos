# Tower Game

Tap to drop each floor onto the tower. Send the meeting link and it becomes a
race: everyone builds their own tower, you see live heights, and the tallest
when the hearts run out wins.

An unofficial port of **[Tower Building Game](https://github.com/iamkun/tower_game)**
by iamkun (MIT). Upstream is a solo tap-to-stack canvas game. This directory
is the GifOS wrap: persistence, a shared seed, and the race. The invite button
is OS chrome — the app never draws one.

```
index.html          landing, game-over, race HUD; no CDN, no analytics, no WeChat
style.css           original colours + phone + the race bar
boot.js             load, replay without a page reload, high score, tap/space
mp.js               prefs, seeded RNG, live heights, the race
icon.mjs            procedural icon + 1200×720 cover
vendor.mjs          rebuilds vendor/* from the pin. The only net step.
build.mjs           packs the GIF into site/apps/tower-game/tower-game.gif
vendor/             GENERATED. Pinned classic bundle + data-URL assets. Never edit.
COPYING.txt         MIT (Tower Building Game's)
NOTICE              unofficial-port addendum
```

## Why this can run as a GifOS app

Upstream already ships a webpack IIFE (`window.TowerGame`) plus images and
mp3s. GifOS's runtime inlines `<script src>` and drops `type=module`, so the
bundle rides in as-is. Image and audio paths in JS would 404 inside a srcdoc
iframe, so `vendor.mjs` bakes them into `TOWER_ASSETS` data URLs. Replay
reloaded the page; a GifOS app cannot, so `boot.js` resets the engine in
place.

## capabilities

| capability | why |
|---|---|
| `db` | High score in `prefs` (private). Live race state in `room` (read-write). |
| `multiplayer` | The room. The invite link is the race. |

No `network`. Needs nothing newer than the App Store itself, so `minBuild`
is **947**.

## The race

There is no server. Each player writes only their own row: floors, score,
hearts gone, and the seed they are playing. A joiner copies that seed so the
crane's opening angles match. First to run out of hearts is waiting; tallest
tower when everyone is out wins. Playing alone never waits on a room.

## Building

```bash
node apps/tower-game/vendor.mjs   # only when moving the upstream pin (needs net)
node apps/tower-game/build.mjs    # -> site/apps/tower-game/tower-game.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere. Do not bump `GIFOS_VERSION`.

## Licences

MIT, iamkun / BMQB, Inc, 2018. The notice is packed **inside the GIF** as
`COPYING.txt` and `NOTICE` as well as living here, because a copy of this
app that someone was handed is a distribution of that work. cooljs is
bundled inside `dist/main.js` by upstream. No upstream PR: this is an
unofficial port.
