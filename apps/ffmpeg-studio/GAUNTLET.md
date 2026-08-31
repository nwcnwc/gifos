# Gauntlet — ffmpeg.wasm Studio

**Win:** HandBrake-class trim / MP3 / GIF that never uploads, and the converted clip can live inside the GIF you already have.

## Bars

- **ONE:** HandBrake / ffmpeg CLI — drop a file, pick a job, get a smaller clip. Floor, not ceiling: native HandBrake is faster at long H.264 encodes.
- **TWO:** convert on this device; output lives in the GIF. No account, no server, no upload. Close it, come back, the last kept clip is still here.

## Rounds

1. **Licence** — `@ffmpeg/ffmpeg` MIT; `@ffmpeg/core` 0.12.10 is GPL-2.0-or-later (FFmpeg + x264). Combined listing is GPL-2.0-or-later. Notices packed in the GIF.
2. **Engine** — glue vendored; 31 MB wasm is a required hash pin (jsDelivr CORS `*`). Classic blob worker, `wasmBinary` + `instantiateWasm`, no CDN at runtime, no `type:"module"`.
3. **Jobs** — Trim (copy or re-encode, input-side `-ss`/`-to`), To MP3, To GIF (8 s / 320 px default), To MP4, Extract audio, Custom. Phone: pick and wait. 80 MB input cap, honest.
4. **Save** — Download; Keep in this file (`files` collection, 12 MB cap); recent list. Prefs remember the last job.
5. **Icon / cover / listing** — film strip being trimmed; cover is mid-trim of concert.mp4 0:12–0:38 at 67%. Tagline sells the on-device reason.

## Remaining gap

Single-thread ffmpeg.wasm is slow at long re-encodes versus native HandBrake. Copy-trim and short MP3/GIF are the jobs this version wins on; a two-hour film still belongs on a desktop CLI.
