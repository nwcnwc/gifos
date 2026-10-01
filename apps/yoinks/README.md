# yoinks (GifOS port)

Port of [yoinks](https://github.com/pablostanley/yoinks) by Pablo Stanley
(MIT, pinned in `vendor/UPSTREAM.txt`): paste a video link, pick a
resolution or audio-only mp3, done.

Upstream is an Ink terminal app that shells out to yt-dlp and ffmpeg. Neither
can run inside a sandboxed app frame, and the runtime caps a `gifos.fetch`
body at 8 MB, so the port keeps yoinks' screens and swaps the engine:

- **Extraction** is a [cobalt](https://github.com/imputnet/cobalt) instance
  the person names in Settings (`POST /` with the documented JSON schema,
  `alwaysProxy` on so every answer is a tunnel with an attachment
  disposition). The public instances all sit behind Turnstile, which a
  sandboxed frame cannot pass, so there is no default. An `Api-Key` is
  optional.
- **The bytes never cross the bridge.** The tunnel URL is opened in a new tab
  (`capabilities.links`), and the browser's own downloader saves the file.
  When the pop-up is blocked, the same URL is offered as a `target="_blank"`
  anchor the person taps.
- **Title and uploader** come from the site's oEmbed endpoint (YouTube,
  TikTok, Vimeo directly; noembed for the rest), best effort, six-second
  budget. cobalt does not expose format sizes, so the picker lists resolutions
  without the `~232 MB` estimates yt-dlp gave upstream.

What is kept byte-for-byte from upstream: the block-glyph logo and its
intro/sweep animation, the tagline, the framed input with the forged-on yoink
button, the Download panel, the hint bar, the three themes (auto follows
`prefers-color-scheme`), the history (fifty links, `↑` recalls), and the
copy on every screen. Upstream's `^c quit` and `^t` have no meaning in a
browser tab; they became `,` for Settings and `Alt+T` for the theme.

## Capabilities

- `db` — `prefs` (instance, key, theme) and `history`, both private.
- `network: ["*"]` — the instance is a user-supplied URL, the one case
  `llms.txt` allows the wildcard for. The permission sheet says so.
- `links` — the download hand-off.

`minBuild` 2154 is where `capabilities.links` landed.

## Layout

```
index.html style.css app.js     the app (classic script; window.Yoinks
                                exposes the pure parts for test/unit/yoinks.js)
icon.mjs                        procedural 128px animated icon
screenshot.mjs                  renders the picking screen with Playwright
                                into screenshot.png (the store cover)
build.mjs                       packs site/apps/yoinks/yoinks.gif
vendor/COPYING-yoinks.txt       upstream MIT
vendor/UPSTREAM.txt             upstream commit pin
```

```
node apps/yoinks/screenshot.mjs        # only when the screens change
node apps/yoinks/build.mjs
GIFOS_SIGN_KEY=~/.gifos-signing-key-MAJOR-SECRET.json node scripts/sign-apps.mjs yoinks
node scripts/build-app-catalog.mjs
node test/unit/yoinks.js
```
