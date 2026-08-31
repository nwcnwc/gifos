# Parable of the Polygons

Nicky Case and Vi Hart’s playable post on how a slight individual bias
segregates a town of triangles and squares — running as a sandboxed
GifOS app. The essay is intact. Last sandbox sliders live in the file.
Invite shares that town.

Upstream is **[ncase/polygons](https://github.com/ncase/polygons)**
(CC0, Vi Hart + Nicky Case). The original embeds each board in its own
iframe; a GifOS app is one `srcdoc` document, so `town.js` is a
multi-instance rewrite of the same Schelling rules. The cute face PNGs
are the original sprites.

```
index.html      the essay, with canvas mounts instead of iframes
style.css       paper + dark playable wells, phone stacking
town.js         isolated Schelling board (bias, nonconform, step)
slider.js       dual-thumb slider (the original was 400px fixed)
splash.js       hanging intro/outro crowd
net.js          shared sandbox town
boot.js         mounts, gifos.db sliders, invite, Back-by-chapter
sprites.js      original faces as data URLs (built from vendor/img/)
vendor/         CC0 notice, sprites, the segregated snapshot
```

## capabilities

| capability | why |
|---|---|
| `db` | Last sandbox sliders, private. The sandbox board, shared. |
| `multiplayer` | Invite is OS chrome — this app never draws that button. |
| `links` | The essay’s citations (Schelling, Clark, the donate list). |

`minBuild` is **2154** (`capabilities.links`).

## Building

```bash
node apps/parable-of-polygons/build.mjs   # -> site/apps/parable-of-polygons/parable-of-polygons.gif
```

Do not run `scripts/build-app-catalog.mjs` from this tree.

## Licence

CC0-1.0, Vi Hart and Nicky Case. The notice is packed **inside the GIF**
as `COPYING.txt`.
