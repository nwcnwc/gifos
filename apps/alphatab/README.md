# alphaTab

A guitar-tab renderer and player as an ordinary sandboxed GifOS app. Solo it
is Daniel Kuschny's **[alphaTab](https://github.com/CoderLine/alphaTab)**
(MPL-2.0): load Guitar Pro / MusicXML / alphaTex, draw notation + tab, play
through the bundled synthesizer. Send the invite and a friend follows the
playhead.

guitar-bro is a falling-notes trainer. piano-trainer is lessons. lrc-maker
stamps lyric times. This is the missing renderer/player.

```
index.html      chrome, viewport, player bar
style.css       dark chrome around a paper score
vendor/         alphaTab 1.8.4 UMD, Bravura, SONiVOX sf3, licences
sample.tex      public-domain Greensleeves
net.js          last song private; host song read-only; playhead follow
touch.js        play/pause is a thumb target; the page still scrolls
boot.js         mount, blob workers, soundfont, wiring
icon.mjs        playhead walking a tab, and the 1200×720 cover
build.mjs       packs site/apps/alphatab/alphatab.gif
```

## Why this can run as a GifOS app

Upstream wants a script URL for its workers, a font directory, and a
SoundFont URL. The sandbox has none of those. The UMD is inlined; a hidden
`<a href>` to the same files becomes a `data:` URL at mount, which boot
turns into blob Workers (`capabilities.wasm`) and `loadSoundFont(uint8array)`.
Playback is `WebAudioScriptProcessor` so the AudioWorklet path is never
taken. `connect-src` stays empty.

## capabilities

| capability | why |
|---|---|
| `db` | Last song private; host song `read-only`; playhead `read-write` and `lead`-able. |
| `wasm` | Blob workers for rendering and the synth. |
| `multiplayer` | Invite follows the playhead. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/alphatab/vendor.mjs   # pin @coderline/alphatab@1.8.4
node apps/alphatab/build.mjs    # -> site/apps/alphatab/alphatab.gif
```

## Licence

MPL-2.0, Daniel Kuschny / CoderLine. Bravura is SIL OFL 1.1. The SONiVOX
soundfont is Apache-2.0. Notices ride **inside the GIF**.
