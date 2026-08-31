# The Evolution of Trust

Nicky Case's explorable essay on the game theory of cooperation, running as
an ordinary sandboxed GifOS app. Solo it is the original from
[ncase.me/trust](https://ncase.me/trust/). Close it and you resume on the
same chapter. Send the invite and a friend watches the same tournament.

The explorable is **[The Evolution of Trust](https://github.com/ncase/trust)**
by Nicky Case — CC0. This directory is the GifOS port: the vendored static
game, a chapter save, phone-fit scaling, and invite-as-spectating.

```
index.html      stage, footer, footnotes overlay, boot gauge
style.css       phone scale, watch banner, notes
vendor/         pinned ncase/trust (gh-pages @ 6ec45d7)
fetch-hook.js   PIXI / Howler / img.src served from packed bytes
net.js          host broadcasts chapter + tournament commands
boot.js         gifos.assets load, chapter save, Back, scale
icon.mjs        two peeps playing the Game of Trust
build.mjs       packs site/apps/evolution-of-trust/evolution-of-trust.gif
```

## Why this can run as a GifOS app

Upstream is a static slideshow: PIXI sprites, Howler mp3s, one `words.html`
XHR. The sandbox has no URLs to fetch, so pictures and sounds ride as
`.assets/` files and `fetch-hook.js` answers PIXI/Howler from blob URLs.
`words.html` is inlined at pack time. The Facebook/Twitter share widget and
the fan-translation list are dropped (Invite is OS chrome; translations
need the network).

Button clicks, a bonk, and the machine-start sting were replaced with short
tones. Upstream used a CC BY-NC pack and a CC Sampling+ slot machine for
those five files; everything else (music, coins, laugh, drumroll…) stays
the CC0 original.

## capabilities

| capability | why |
|---|---|
| `db` | Chapter / mute in a `private` collection; the host's tournament in a `read-only` one; presence in `watchers`. |
| `multiplayer` | The room. Invite is OS chrome. |
| `links` | Credits open Nicky's site, Patreon, and Explorables in a new tab. |

`minBuild` is **2154** (`capabilities.links`; packed `.assets/` already needed 1206) — files are served into the sandbox
starting with that runtime. Older GifOS would boot a silent, pictureless
essay.

## Building

```bash
node apps/evolution-of-trust/build.mjs   # -> site/apps/evolution-of-trust/evolution-of-trust.gif
```

## Licence

CC0 1.0, Nicky Case. The notice is packed **inside the GIF** as
`COPYING.txt`. Futura Handwritten (Billy Snyder) is free for any use; the
music is Komiku's "Bleu" (CC0). See `vendor/README.md` for the full credits.
