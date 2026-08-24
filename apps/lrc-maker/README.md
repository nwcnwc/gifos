# LRC Maker

An unofficial local port of
**[lrc-maker](https://github.com/magic-akari/lrc-maker)** (MIT) by
magic-akari. Load a local song, tap timings, export LRC. The song and
the lyrics live in the file (`gifos.db`). The React app is not packed;
`@lrc-maker/lrc-parser` is vendored as classic UMD. On a phone, Stamp
sits under the thumb.

![screenshot](screenshot.png)

## capabilities

`db` + `multiplayer`. `minBuild` **947**. No network, no microphone.
The song bytes stay in the private save. Invite shares lyrics + stamps,
not the audio file.

```bash
node apps/lrc-maker/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
