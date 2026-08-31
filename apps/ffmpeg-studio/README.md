# ffmpeg.wasm Studio

ffmpeg one-liners that never upload. Drop a clip, trim it, convert to MP3 or
GIF, and keep the result in this file. Unofficial port of
[ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) (Jerome Wu): the
published `@ffmpeg/core` 0.12.10 engine, running entirely on this device.

```
index.html      drop zone, jobs, result
style.css       dark studio chrome
app.js          jobs, probe, persist
engine.js       classic-worker client, gifos.assets wasm
worker.js       LOAD/EXEC/FS — concatenated with glue at pack
vendor/         @ffmpeg/core 0.12.10 glue + licences
icon.mjs        film-strip trim animation + 1200×720 cover
build.mjs       packs site/apps/ffmpeg-studio/ffmpeg-studio.gif
```

## What rides where

| | where | bytes |
|---|---|---|
| App, glue, worker | **in the GIF** | glue 112 KB |
| `ffmpeg-core.wasm` | **required** `gifos.assets` pin | 32,232,419 |

The wasm is above the 8 MB in-GIF floor, so it is a hash-pinned install
download from jsDelivr (`Access-Control-Allow-Origin: *`). Instantiation uses
`wasmBinary` + `instantiateWasm` inside a **classic** blob worker — never
`type:"module"`, and the glue never `fetch()`es.

## capabilities

| capability | why |
|---|---|
| `wasm` | Run the engine; blob worker so the page can paint progress. |
| `db` | Last job in `prefs`; kept clips in `files`; recent names in `history`. All private. |

No multiplayer: a 50 MB video does not belong on the invite bus. `minBuild`
**1178** — required asset pin.

## Build

```bash
node apps/ffmpeg-studio/vendor.mjs   # only when the pin moves (needs net)
node apps/ffmpeg-studio/build.mjs    # -> site/apps/ffmpeg-studio/ffmpeg-studio.gif
```

Do **not** run `scripts/build-app-catalog.mjs` or `scripts/sign-apps.mjs` from
this work.

## Licence

The wrapper is MIT (`COPYING-ffmpegwasm.txt`). `@ffmpeg/core` is FFmpeg plus
GPL libraries (x264), **GPL-2.0-or-later** (`COPYING-ffmpeg-core.txt`). Both
notices are packed inside the GIF. The listing licence is GPL-2.0-or-later.
