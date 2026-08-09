# Pocket Voice

The first **Provider app** (see `docs/providers.md`): it doesn't do a job on
its own screen — it gives the OS an ability. Installed and assigned in
**Settings → AI models**, it serves the **Text → speech** AI role to every
app on the computer via `gifos.provider.serve({ tts: … })`, entirely
offline: no network capability, no key, nothing leaves the device.

## How it's put together

- **The GIF is slim** (~60 KB): UI + driver only. The engine arrives by the
  **install-time assets** pattern (`gifos-assets.js`, download-then-seal):
  the manifest pins three files by URL + SHA-256 —
  `espeak.js` (the eSpeak core compiled to JS, from meSpeak/speak.js),
  `mespeak-config.json`, and `voice-en-us.json` — which the OS downloads
  from `site/apps/pocket-voice/assets/` at install, verifies, and seals
  into the GIF under `.assets/`. The app reads them back with
  `gifos.assets(path)` and executes the core via inline-script injection
  (no eval, no wasm hatch needed — it's plain asm.js-era JavaScript).
- `app.js` is a compact driver derived from meSpeak's raw-WAV path
  (VFS setup → argstack → `run()` → read `wav.wav`), with the known
  every-~80th-call FS hiccup handled by a rebuild-and-retry.
- OpenAI-style voice names (`nova`, `onyx`, `whisper`, …) map onto eSpeak
  variants, so consumer apps written against a cloud TTS work unchanged.
  `speed` accepts the OpenAI 0.25–4 multiplier; returns 22.05 kHz mono WAV
  as `{ bytes, mime: 'audio/wav' }`.

The single copy of the engine assets lives in `site/apps/pocket-voice/assets/`
(the publish boundary — no duplicate under `apps/`); `build.mjs` and
`scripts/build-app-catalog.mjs` both verify the manifest pins match those
files byte-for-byte.

## Licensing

eSpeak and the meSpeak/speak.js build are **GPLv3** (see
`COPYING-espeak.txt`), so this app is GPLv3 — the same posture as
Chess Grandmaster bundling Stockfish. Source lives in this directory and in
the staged assets; the engine files carry their original notices.

## Rebuild

```bash
node apps/pocket-voice/build.mjs        # packs the slim GIF into site/apps/pocket-voice/
node scripts/build-app-catalog.mjs      # refresh the store catalog
```

Not yet signed with the gifos.app key (this build environment holds no
private key) — sign via `site/sign.html` and re-commit the GIF to light the
badge, same as anyroad.
