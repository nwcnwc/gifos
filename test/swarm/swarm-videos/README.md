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
lines. Use existing `test/swarm/swarm-voices.js` espeak clips for real mic audio, or
mux your own later.

## Sizes

- ~50 portraits + 50 clips ≈ **69 MB** total
- Each clip ~1 MB, 6 seconds

## Using with `swarm.js`

`swarm.js` currently paints solid-color canvases. To drive a bot camera from
these files, replace `fakeCam` so `getUserMedia` returns a looping
`<video>` → `captureStream()` (or `HTMLVideoElement.captureStream()`), e.g.
load `clips/((idx % 50) + 1).padStart(2,'0')-*.mp4` as a data URL / file URL
and set `loop = true`, `muted = true` (mic stays the WebAudio path).

Index mapping: bot `idx` → clip `(idx % 50) + 1` (1-based roster id).

## Roster names (01–50)

See `roster.json`. Examples: Maya Chen, Jamal Brooks, Sofia Alvarez, …
Jordan Lee.

## Regenerating

Re-run portrait + video gen for any missing `NN` under `portraits/` / `clips/`.
Keep **one video gen at a time** (or at most two) — parallel bursts hit the
Imagine video rate limit (HTTP 429).
