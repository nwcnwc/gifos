# Metronome

A click that keeps time. Tempo lives in this file. No microphone.

An unofficial port of **[cwilso/metronome](https://github.com/cwilso/metronome)**
by Chris Wilson (MIT). Lookahead Web Audio scheduler, no Worker (srcdoc has
no relative worker URL; audible audio already prevents timer throttling).

```
index.html                     pendulum, tempo, signature, subdiv, start, tap
style.css                      dark click-track UI, phone-sized targets
app.js                         lookahead scheduler + private save + pendulum
mp.js                          optional meeting: same numbers, local click
icon.mjs                       procedural sticker and the 1200×720 cover
build.mjs                      packs site/apps/metronome/metronome.gif
vendor/metronome.js            original, MIT, pinned (not auto-run)
vendor/metronomeworker.js      original worker, MIT, pinned
```

## capabilities

| capability | why |
|---|---|
| `db` | Tempo/signature in a `private` collection. |
| `multiplayer` | Room shows the host numbers read-only. Each device clicks locally. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/metronome/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.

## Licence

- metronome — MIT (`vendor/COPYING-metronome.txt`)
