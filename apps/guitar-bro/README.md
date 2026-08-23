# Guitar Bro

Notes fall down the neck. Play them on a real guitar, or tap the fret. Playing
alone is that trainer. Press **Play a friend**, then **Invite**, and it becomes
a race on the same song — highest score wins.

An unofficial port of **[Guitar Bro](https://github.com/makaroni4/guitar_bro)**
by Anatoli Makarevich / makaroni4 (MIT). The original held a live microphone
and pulled jQuery, d3 and analytics off the network. This copy keeps the
strings, the songs and the falling-note scoring as classic scripts so they run
in the sandbox, including on a phone. Listen records a short clip on this
device (`gifos.recordAudio`) and names the note — the app never holds the mic.

```
index.html      shell: neck canvas, menu, friend strip
style.css       navy neck, cream notes, a sheet on the right
config.js       six (plus metal) strings and their frequencies
songs.js        the original chart list, seedable random notes
pitch.js        peak-in-band detector + a sine so you can Hear it
game.js         falling notes, hearts, tap, scoring
mp.js           the race: same song, own rows, highest score
app.js          menu, Listen, private prefs
icon.mjs        procedural neck icon + 1200×720 cover
build.mjs       packs the GIF; checks songs and a 440 Hz A
```

## capabilities

| capability | why |
|---|---|
| `db` | Solo prefs (private) and the room’s live scores (read-write). Needs nothing newer than the App Store itself, so `minBuild` is **947**. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws its own share sheet. |
| `microphone` | Listen asks GifOS for a short clip and names the note. Tap still works with the mic off. |

No `network`, no `wasm`. Classic JS.

## How the race works

1. Press **Play a friend**. Press **Invite** (the GifOS menu) to send the link.
   Solo still works if nobody comes.
2. Everyone who is in the room **plays the same song**, same string, same speed.
   The chart lives on each player’s own row; everyone adopts the lowest-id
   player on the current round.
3. Each player publishes **score + hits** on **their own row**. The notes
   themselves never leave this device.
4. **Highest score when the song ends wins.**
5. **Play again** starts the next round on the same chart. **← Solo** puts you
   back on the original trainer, with the prefs you had.

## Building

```bash
node apps/guitar-bro/build.mjs   # -> site/apps/guitar-bro/guitar-bro.gif
```

Do not bump `GIFOS_VERSION`. The catalog refresh (`build-app-catalog.mjs`) is
a separate, signed step.

## Licence

Guitar Bro is MIT, Anatoli Makarevich, 2017. The notice is packed **inside
the GIF** as `COPYING-guitar-bro.txt`.
