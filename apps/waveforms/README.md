# Waveforms

An explorable guide to sound waves. Hear sine, square, saw. Nothing is
uploaded.

An unofficial port of **[Waveforms](https://github.com/joshwcomeau/waveforms)**
by Josh Comeau (MIT). Upstream is React; this is the same explorable as
classic scripts (the math from `waveform.helpers.js`, the teaching copy,
Web Audio). No React bundle.

```
index.html      graph, sliders, step copy
style.css       indigo/cream explorable chrome
app.js          steps, oscillator, gifos.db save
icon.mjs        travelling sine icon + 1200×720 cover
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
