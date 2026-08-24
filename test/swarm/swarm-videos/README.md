# Swarm intro videos (Grok Imagine)

50 fictional people, each as a **portrait** + a **6s talking-head clip** for
swarm meet bots to loop as fake cameras.

```
test/swarm/swarm-videos/
  roster.json          # id, name, intro line, look description
  portraits/NN-slug.jpg
  clips/NN-slug.mp4    # ~6s, 400×736 (9:16-ish), H.264 + AAC
```

Generated with Grok Imagine: `image_gen` (portrait) → `image_to_video`
(talking-head intro motion). **Visual only for speech** — mouth/head motion is
synthesized; there is no reliable lip-synced dialogue track of the roster
lines. With the pack present the clip's OWN audio is the bot's mic (the ~6 s
intro plays once); the `test/swarm/swarm-voices.js` espeak clips are the
no-pack fallback.

## Sizes

- ~50 portraits + 50 clips ≈ **69 MB** total
- Each clip ~1 MB, 6 seconds

## Using with `swarm.js`

Already wired in: `swarm.js` loads this pack from `test/swarm/swarm-videos`
(override with `--videos <dir>`) and each bot's camera IS one of these clips
(`fakeCamVideo` — a looping `<video>` → `captureStream()`), the person chosen
at random per bot; the clip's own audio becomes the bot's mic. Solid-color
swatch cams + espeak voices remain the fallback when the pack is absent (or
under `LITE`).

## Roster names (01–50)

See `roster.json`. Examples: Maya Chen, Jamal Brooks, Sofia Alvarez, …
Jordan Lee.

## Regenerating

Re-run portrait + video gen for any missing `NN` under `portraits/` / `clips/`.
Keep **one video gen at a time** (or at most two) — parallel bursts hit the
Imagine video rate limit (HTTP 429).
