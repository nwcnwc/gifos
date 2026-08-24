# The House

You're in a strange house. Click to look. Find the way out.

An unofficial port of
**[The House](https://github.com/arturkot/the-house-game)**
by Artur Kot (MIT; artwork CC BY 3.0). Upstream is a static HTML/CSS/JS
point-and-click walking-sim: each room is a markup file, CSS paints the
isometric view, jQuery drives the walk and the inventory.

The rooms are **wrapped, not rewritten**. Packed GIF size is large on
purpose (~20 MB): art and sounds stay. Data-URIs in the packed CSS/JS
maps are how pictures and audio load with no network.

```
index.html          GifOS shell; original #the_game chrome
style.css           shell only (fill, tap)
boot.js             SM2 defer + in-memory store polyfill
patch.js            construct SoundManager (HTML5, no Flash)
app.js              room-HTML map, picture/sound remap, private save
icon.mjs
build.mjs
vendor/             original game (rooms, css, js, images, sound, fonts)
vendor/COPYING-the-house.txt
vendor/UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | Inventory and room progress (`save`, private). |

No `network`. No `fullscreen`. `minBuild` is **947**. Walking-sim is solo;
Invite is OS chrome if you ever want someone watching.

## Building

```bash
node apps/the-house/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
