# Star Battle

A side-scrolling space shooter that runs as an ordinary sandboxed GifOS app.
Solo it is gd4Ark's Star Battle. Send the invite and extra ships appear in
the same sky. On a phone the sky turns so you fly toward the top of the
screen; hold FIRE to keep shooting.

The engine is **[Star Battle](https://github.com/gd4Ark/star-battle)** by
gd4Ark — MIT, written for the 2017 Abu Dhabi World Skills Competition. This
directory is the GifOS port: a classic-script shell around it, a thumb
stick, and the extra ships. Upstream has no networking.

```
index.html              start / play / over / rank markup, touch overlay
style.css               scale-to-fit wrap, scoreboard, stick HUD
vendor/js/              UNMODIFIED upstream scripts. Never edit.
vendor/img/             UNMODIFIED sprites. Never edit.
vendor/sound/           UNMODIFIED mp3. Never edit.
vendor/css/             upstream CSS; the one background url is a data URL
vendor/assets.js        data-URL map so Image()/Audio() work in a srcdoc
vendor.mjs              copies vendor/ from the pin. The only step needing net.
boot.js                 localStorage stand-in, asset rewrite, scoreboard
touch.js                left stick WASD, right FIRE
net.js                  extra ships — presence, hit claims, the scoreboard
wrap.js                 hangs the above on the original prototypes
icon.mjs                firing-chick icon; cover composites the real sprites
build.mjs               packs site/apps/star-battle/star-battle.gif
```

## Why this can run as a GifOS app

Upstream is one canvas, a handful of classes, keyboard, and a few images
and sounds. No fetch. `connect-src 'none'` then costs it nothing. Original
`main.js` is not loaded: boot.js starts the Game after the asset map is
applied, because a srcdoc iframe has no `./img/` files.

## capabilities

| capability | why |
|---|---|
| `db` | Rank list and mute in a `private` collection; ships in a `read-write` one; the wave in a `read-only` one the host writes. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Extra ships

Each player owns one row and only ever writes that row. The host simulates
the wave and publishes it on `world`. A guest who shoots a body claims the
hit on their own row; the host applies it. Fuel is each ship's own.

## Building

```bash
node apps/star-battle/vendor.mjs   # only when moving the upstream pin (needs net)
node apps/star-battle/build.mjs    # -> site/apps/star-battle/star-battle.gif
```

## Licence

MIT, 4Ark / gd4Ark. The notice is packed **inside the GIF** as
`COPYING-star-battle.txt` as well as living here, because a copy of this
app that someone was handed is a distribution of that work.
