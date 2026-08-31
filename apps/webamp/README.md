# Webamp

An unofficial port of **[Webamp](https://github.com/captbaritone/webamp)**
(Jordan Eldredge, MIT) — Winamp 2.9 in the browser — as a sandboxed GifOS
app. The engine is the pinned UMD bundle. This directory is the shell:
dropped MP3s in the file, EQ and playlist restored on boot, and an invite
that shares the setlist and the graphic EQ. First open seeds three original
demo tracks and a smile EQ so the window is already a player.

```
index.html      desktop, dock, file pickers
style.css       Winamp-desk background, dock, room strip
vendor/         webamp@2.2.0 UMD + MIT notice. Never fetched at runtime.
demo.js         original PCM setlist (Intro, Green LED, On a Plane)
boot.js         construct Webamp, persist library / EQ / layout
net.js          invite: shared playlist titles + shared EQ
touch.js        + MP3s / Skin dock, first-run hint, phone stacking
icon.mjs        animated Winamp window
shot.mjs        photographs the real first-boot window into screenshot.png
build.mjs       packs site/apps/webamp/webamp.gif
```

## Why this can run as a GifOS app

Upstream is one script tag and blob/File tracks. The default skin is
compiled into the bundle, so the player paints with `connect-src 'none'`.
User MP3s and `.wsz` skins are `File` / `Blob` objects, never URLs.
`Add URL` is wired to a refusal; the player is told it is offline.

## capabilities

| capability | why |
|---|---|
| `db` | Library bytes, EQ, playlist, layout, dropped skins. |
| `multiplayer` | Shared setlist + graphic EQ. Invite is OS chrome. |
| `links` | The in-player "Webamp..." credit opens the upstream about page. |

`minBuild` is **2154** (`capabilities.links`).

No `network`. Skins and CD art are not fetched.

## Building

```bash
node apps/webamp/build.mjs   # photographs first boot, then packs site/apps/webamp/webamp.gif
```

To move the upstream pin (needs the network):

```bash
node apps/webamp/vendor.mjs
```

## Licence

MIT, Jordan Eldredge. The notice is packed **inside the GIF** as
`COPYING-webamp.txt`. The Winamp name and original interface are
Nullsoft's; this is a clean-room reimplementation plus Webamp's
bundled base-skin CSS.
