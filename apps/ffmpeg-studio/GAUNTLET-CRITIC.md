# ffmpeg.wasm Studio gauntlet critic

Blind run of the shipped GIF `site/apps/ffmpeg-studio/ffmpeg-studio.gif` (248 KB, signed) in the real GifOS sandbox (desktop 1280×900 / 1100×820 and phone 390×844), the store listing at `/store.html#app=ffmpeg-studio`, and a 4 s 440/880 Hz WAV through Trim (copy) and To MP3. Bar ONE is HandBrake / ffmpeg CLI. Bar TWO is convert on this device, output lives in the GIF, no upload. Distinct from vocal-remover (audio stems) and squoosh (still images).

**Winner: OURS**

A stranger who would otherwise install HandBrake for a ten-second cut has a reason they can say back after using this: the clip never left the tab, and Keep put the result in the file so close/reopen still held it. That is bar TWO, and it held in the running build. Native HandBrake remains faster and less blind at long H.264 — that is the floor this listing already admits, not a round it lost.

## Stranger-reason

Asked: you know HandBrake / `ffmpeg` — why would you use this one?

The listing's answer is "the file never leaves this device, and the result can live in this app so you close it and come back still holding the output." After a cold run, both are true of the build that ships beside that copy.

- App-frame network: **zero** requests. The only off-origin fetch was the OS pin `https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm` (32,232,419 bytes), from run.html, not the sandbox.
- Trim copy `0:01–0:03` of a 4.00 s WAV: `Done in 0.4s — 88 KB.` then `Done in 0.1s — 88 KB.` Preview `0:00 / 0:02`. ffmpeg log: `Stream #0:0 -> #0:0 (copy)`, Lavf 59.27.100.
- To MP3 of the same WAV: `Done in 1.5s — 15 KB.` Preview `0:00 / 0:04`. Log: `pcm_s16le (native) -> mp3 (libmp3lame)` at 29.7 kbit/s.
- Keep: `Kept in this file. Close it and come back still holding tone-4s-trim.wav.` `gifos.db('files').get('last')` had 90,190 bytes. Close the room, dblclick again: history listed it, Open restored an `<audio>` of `tone-4s-trim.wav · 88 KB` without loading the converter.

HandBrake's reason is still true: a timeline, a queue, and a two-hour film. This port does not take that away. It sells a different job, and that job actually ran.

## Single biggest remaining gap

**You trim blind.** Duration is probed (`172 KB · 0:04` on the file chip) and then thrown away: `#f_end` stays the empty placeholder `end` (`endAfterProbe === ""`). There is no source player, no waveform, no scrubber, no in/out on a picture. Start and End are text boxes. Help is honest ("ffmpeg as one-liners, not a timeline editor"); the cover is not — it paints a concert.mp4 with a seek bar at 0:12–0:38 and "67% COPY TRIM", which is a product that does not open.

Until the probed duration fills End and the source can be heard/seen before Run, this loses the one thing HandBrake users actually do with a clip: look at it, then cut it.

## Piece judgements

### Icon — OURS

12-frame film strip on a dark rounded card, teal blade walking left→right, offcut falling away. At Home Screen size next to Camera / My Media / App Store it still reads as "cut a clip", not a decoration. The loop is the job. Original HandBrake is a desktop app with a skillet icon; ffmpeg CLI has none. This is the one piece that already wins on sight.

### Cover — COMP

`cover.jpg` is a 1200×720 pixel-font illustration of a fake player (peach oval "stage", hills, seek bar, `CONCERT.MP4 24.1 MB 3:12`) plus a control column that is not the running chrome. First paint of the GIF is a dashed drop zone and six job chips. No concert, no seek bar, no 67%.

- Listing hero: readable as "video trimmer," toy-like next to a real mid-use screenshot.
- Grid card (~240×150, `object-fit: cover`): the player still scans; Start/End/Run die.

A cover that lies about the first minute loses to HandBrake's honest window, and to this app's own first paint.

### Listing — OURS (one nick)

Rendered listing matches `listing.json`. Tagline is a good card line. Description leads with on-device + keep, then the 31 MB pin, then phone honesty ("short clips are the sweet spot, a two-hour film is not"), then the job list. Credits are honest (unofficial, bugs to GifOS, Jerome Wu / ffmpeg.wasm, `blessed: false`). License **GPL-2.0-or-later**. Abilities: Saves data in the icon, Runs WebAssembly — no network row. No Invite, no jam, no room. Distinct from vocal-remover and squoosh: tags are trim/mp3/gif/video, not stems, not jpeg/webp/avif.

The nick is store chrome, not the listing body: `248 KB download + 31 MB model`. It is a converter wasm, not an ML model. The paragraph underneath says "converter (about 31 MB)" and is the one a human will quote.

| claim | running build |
| --- | --- |
| "the file never leaves this device" | app frame: 0 requests |
| "close it and come back still holding the output" | Keep → reopen → Open restored 88 KB |
| "Installing also downloads the converter (about 31 MB)" | OS fetched the pinned wasm; later jobs did not |
| "A phone is pick-and-wait" | 390×844: chips wrap, drop zone + result force a scroll (`scrollHeight` 1256 / `clientHeight` 812) |
| "HandBrake and the ffmpeg CLI need an install" | true; this is one GIF in a tab |
| no multiplayer | none claimed, none declared, none drawn |

### Trim / MP3 jobs — OURS (the asked round)

A real trim and a real MP3 completed inside the sandbox, on this device, with the published `@ffmpeg/core` 0.12.10 engine (GPL, libmp3lame + x264 present).

- Engine: first file pick 8.6 s including pin instantiate, then `ffmpeg ready · on this device`. Wasm is a required hash pin (`9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7`, 32,232,419 bytes). Glue rides in the GIF (`worker-src.js` 117,103 bytes). Classic blob worker, `wasmBinary` + `instantiateWasm`. No `type:"module"`.
- Copy-trim is the fast path it claims. Re-encode MP3 used libmp3lame, not a browser encoder.
- Preview of the *result* works (`<audio controls>`). Preview of the *input* does not exist.
- ffmpeg log ends `Aborted()` after a successful mux. The job still returned bytes. Ugly, not a red on the file.

To GIF / To MP4 / Custom were not driven this pass (box was at load 15–50 with other Chromiums). Those buttons paint and the argv in `buildArgs` is real ffmpeg. Unmeasured is not a pass.

### Keep-in-file — OURS (with a duplicate)

Bar TWO held. `files` id `last` is the one clip the GIF will still hold after close. Open on reopen restored it, and the second boot did **not** need the 31 MB engine to play the kept result.

Nicks, not a failed round:

- One slot. A second Keep overwrites `last`.
- 12 MB cap; bigger results are Download-only. Honest in help.
- History writes **twice** per Keep (`remember()` then `stashHistory(..., true)`), so reopen listed `tone-4s-trim.wav · 88 KB` twice, one Open. Open always reads `files.get('last')`, not the row you tapped.
- `prefs` was `null` after a Trim-only session — last-job persist only fires on a chip click, and Trim is the default.

### Phone — OURS (usable, not pretty)

390×844: chips wrap two rows, 44 px targets, file picker is the drop zone. Result card sits below the fold under a drop zone that is still empty after a restore. Pick-and-wait is the contract; a giant unused drop zone on a restored clip is wasted fold. No crash, no horizontal overflow of the jobs.

### No upload / no CDN at runtime — OURS (wall held)

App-frame requests: none. OS-frame off-origin: the one pinned jsDelivr wasm. `connect-src` never opened for the app. Invite in the OS chrome is not the app claiming a room.

### GPL-2 notices — packed

Decoded GIF files include:

- `COPYING-ffmpeg-core.txt` (15,981 bytes) — names FFmpeg + x264, **full GNU GPL Version 2, June 1991**, points at the 0.12.10 pin and ffmpeg.org.
- `COPYING-ffmpegwasm.txt` (1,157 bytes) — MIT, Jerome Wu.

Listing and footer both say GPL-2.0-or-later. `vendor/COPYING.GPLv2` is not packed as its own path; it would be a duplicate of the core notice. No in-app license screen — the notices live in the GIF filesystem, which is the distribution. Combined work is correctly not MIT.

### Distinct from vocal-remover / squoosh — held

This is trim / transcode of video and audio. It does not split stems. It does not compress stills. Cover, jobs, and listing do not pretend otherwise.

## Wall breaks

- **No remote load from the app.** Held.
- **Required wasm pin, not a runtime CDN.** Held. First run downloads; after that the asset store serves it.
- **Saved data in gifos.db.** Held for Keep. History is noisy. Prefs is lazy.
- **Listing truth.** Held, with the store's "model" wording as the only overclaim that is not the listing author's sentence.
- **Cover truth.** Failed as a picture of the running app. Not a failed product round.
- **minBuild 1178 / wasm+db / no network / no multiplayer / unofficial blessed:false / GPL inside the GIF.** Honest on paper and in the unpacked bytes.
- **Invite is OS chrome.** Correctly not drawn by the app.

## Bar check

Bar ONE (HandBrake / ffmpeg CLI) is not mediocre. A timeline, a queue, filters, and a machine that can finish a film are the product. "As good as" would already lose on a wasm port; this is slower, blinder, and capped at 80 MB in. The listing says that. The jobs it *does* claim — short trim, MP3 — completed.

Bar TWO is why this should win. It does: convert on this device, nothing uploaded, kept clip still here after close.

Native CLI was not on this box as a full ffmpeg (Playwright's `ffmpeg-linux` is a VP8/png stub and cannot even demux WAV). Speed comparison for the 4 s clip is therefore "wasm did it in 0.1–1.5 s", not a fair native A/B. A two-hour film still belongs on a desktop CLI. That sentence is already in the listing.
