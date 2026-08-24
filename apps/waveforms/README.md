# Waveforms

An explorable guide to sound waves. Hear sine, square, saw. Nothing is
uploaded. Built as a phone-first walk-through: the original is a long
desktop article.

An unofficial port of **[Waveforms](https://github.com/joshwcomeau/waveforms)**
by Josh Comeau (MIT). Upstream is React; this is the same explorable as
classic scripts (the math from `waveform.helpers.js`, the teaching copy,
Web Audio). No React bundle. Harmonics you stack on the graph are the
same harmonics you hear (periodic wave), so Converge is a real lesson.

```
index.html      graph, Hear, shape chips, sliders, step copy
style.css       dark chrome, cream graph, sticky phone nav
app.js          steps, oscillator, gifos.db save, gifos.onBack
icon.mjs        morphing sine→square→saw icon + 1200×720 cover
build.mjs       packs the GIF into site/apps/waveforms/waveforms.gif
vendor/         classic waveform math + MIT notice
```

## capabilities

| capability | why |
|---|---|
| `db` | Last step and sliders, private. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/waveforms/build.mjs   # -> site/apps/waveforms/waveforms.gif
```

Do not run `scripts/build-app-catalog.mjs` from this tree.

## Licence

Waveforms is MIT, Joshua Comeau, 2018. The notice is packed **inside the GIF**
as `COPYING-waveforms.txt`.
