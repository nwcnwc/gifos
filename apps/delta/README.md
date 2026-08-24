# Delta

Jake Gordon's HTML5 homage to C64 Delta, as a GifOS app. Formations, rocks,
three lives. The original SID recording is not shipped.

```
index.html / style.css / boot.js / touch.js
vendor.mjs    pin + data-URI sprites, no music
build.mjs     packs site/apps/delta/delta.gif
```

`capabilities.db` for the high score. `minBuild` 947. No multiplayer.

```bash
node apps/delta/vendor.mjs
node apps/delta/build.mjs
```

MIT, Jake Gordon. Notice inside the GIF as `COPYING.txt`.
