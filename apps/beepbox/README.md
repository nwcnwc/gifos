# BeepBox

An unofficial local port of **[BeepBox](https://github.com/johnnesky/beepbox)**
by John Nesky (MIT). The original chiptune song tracker, running as an
ordinary sandboxed GifOS app. The song is saved inside the file — sharing
the GIF shares the song. Press Invite and a friend jams the same track.

Upstream is TypeScript compiled to one IIFE. That bundle is vendored; it is
never fetched at runtime. Persistence, jam, and phone zoom are this shell.

```
index.html                    editor container, zoom HUD
style.css                     dark shell around the tracker
shim.js                       localStorage/sessionStorage; blocks jsdelivr
vendor/beepbox_editor.min.js  pinned BeepBox 4.2.2 editor IIFE
vendor/seed.js                first-run loop, generated from Song
boot.js                       gifos.db song JSON, start the editor
net.js                        jam: host copies a legal song onto `song`
touch.js                      + / − and pinch-zoom, overflow pan
icon.mjs                      playhead-on-a-grid icon + 1200×720 cover
build.mjs                     packs site/apps/beepbox/beepbox.gif
vendor.mjs                    rebuild vendor/ from the pin (needs net)
```

## capabilities

| capability | why |
|---|---|
| `db` | The song (private) and the room's shared copy (read-write). `minBuild` is **947**. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

No `network`. WAV / MIDI / JSON export stay local. MP3 is refused (upstream
loaded lamejs from a CDN).

## The song

`songs` holds the current song as BeepBox JSON, private, so a GIF you
hand someone is the save. In a room the host writes the same JSON onto
the `song` row; guests never write that row. Each player writes only
their own presence row.

## Building

```bash
node apps/beepbox/vendor.mjs   # only to move the pin
node apps/beepbox/build.mjs    # -> site/apps/beepbox/beepbox.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

BeepBox is MIT, John Nesky and contributing authors, 2012–2024. The notice
is packed **inside the GIF** as `COPYING-beepbox.txt`.
