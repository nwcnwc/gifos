# ffmpeg.wasm Studio

Drop a video or audio file, pick a job, wait. Trim, convert to MP3, or make a GIF — the file never leaves this device.

This is ffmpeg as one-liners, not a timeline editor. Short clips on a phone; longer files on a computer.

## Drop a file

Tap the drop zone (or drop a file onto it). Video or audio: MP4, MOV, WebM, MKV, MP3, WAV, M4A, and similar. The converter starts the first time you pick a file — installing this app already downloaded it (about 31 MB), so later clips skip that wait.

A duration appears once ffmpeg has looked at the file.

## Jobs

- **Trim** — start and end times (`0:12`, `1:03.5`, or seconds). **Copy** (on by default) is fast and keeps the original quality; turn it off to re-encode if a player will not open the cut.
- **To MP3** — audio only, VBR quality 0 (best) to 9. Default 2.
- **To GIF** — first **8 seconds**, **320 px** wide, 12 fps, unless you change those. Longer GIFs get huge and slow.
- **To MP4** — H.264, fast preset. Slow on a phone; a minute of video can take several minutes.
- **Extract audio** — MP3 or WAV, no picture.
- **Custom** — the rest of an ffmpeg command after the input. Last word is the output filename (`-vn -c:a libmp3lame out.mp3`). The input is already `-i`’d for you.

**Run** starts the job. A log of ffmpeg’s own lines is under **Log**. **Stop** is not available mid-encode — wait it out, or close the app.

## Result

Play it here when the browser can. **Download** saves a copy. **Keep in this file** stores the last result so you can close the app and come back still holding it (about 12 MB cap — bigger files download instead). Recent jobs list names and sizes; tap one that was kept to restore it.

## Limits

The converter runs in this browser, on one thread. Files over **80 MB** are refused; a two-hour film will not finish. Copy-trim of a few seconds is the fast path. Re-encoding a long video is the slow path. If a job fails, the log usually says why (missing codec, bad times, not enough memory).

## What is saved

The last job you picked. Clips you **Keep in this file** (under about 12 MB). Nothing is uploaded.

Unofficial port of [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm).
