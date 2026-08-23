# Battle City

A tank game that runs as an ordinary sandboxed GifOS app. Solo, you defend
the eagle against waves of computer tanks across thirty-five stages. Send
the invite and a friend on another device is the green tank — same stage,
no game server.

This is a **canvas remake**, not a wrap of the React tree. Upstream is
**[feichao93/battle-city](https://github.com/feichao93/battle-city)**
(MIT): a React/Redux/Saga webpack app. GifOS's runtime inlines `<script src>`
and drops `type="module"`, so that tree cannot run inside a GIF. The 35
stages and the SFX ride as-is; the tanks and tiles are redrawn to match
their colour schemes; two-player is a second device over `gifos.db`.

```
index.html          canvas, the hidden SFX tags, the on-screen pad
style.css           pad / fire button
stages.js           the 35 stages, generated from vendor/stages
game.js             sim + draw (classic IIFE)
net.js              presence, pose/fire, the host's world snapshot
sound.js            plays the inlined <audio> tags
boot.js             input, host/guest loop, title
icon.mjs            yellow-tank icon + 1200×720 cover
vendor/sound        feichao93's OGG SFX
vendor/stages       feichao93's stage JSON
build.mjs           packs site/apps/battle-city/battle-city.gif
```

## capabilities

| capability | why |
|---|---|
| `db` | Hi-score in a private collection; player pose and the host's world in read-write ones. |
| `multiplayer` | The room. Invite is OS chrome — this app does not draw a share button. |

No `network`. Nobody writes anybody else's row: each device publishes its
own tank, the host publishes the stage.

## The remake, honestly

Upstream's milestone 1.0 listed "websocket multiplayer" as unfinished. This
copy does the two-player mode the platform is good at: the invite link is
the room, the host's browser simulates the stage and the AI, and the guest
publishes pose and fire. A thumb pad is there because most people open
GifOS on a phone.

Namco's 1985 Battle City remains Namco's. This is an unofficial remake of
an unofficial remake.
