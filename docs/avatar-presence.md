# Avatar presence (brief design)

How GifOS can replace a live camera/mic with an **avatar + optional voice
filters**, including **third-party avatar APIs**, without accounts on gifos.app
and without putting keys in sandboxed apps.

Roadmap pointer: [`roadmap.md`](roadmap.md) §4b. Games / Festival context:
[`mmog-ideas.md`](mmog-ideas.md). Broker pattern today: Settings → Third-party
APIs + `gifos.api` ([`architecture.md`](architecture.md)).

**Status:** ideas — not implemented.

---

## Goal

One **presence** config on the desktop drives every surface that can show a
face: **Meet** (system media plane), and App GIFs that opt into avatars. The
user owns:

1. **Provider credentials** (optional) — same store as third-party APIs.
2. **Avatar description file** — portable look / ids (JSON or packed in a GIF).

Apps and Meet do **not** each speak HeyGen/D-ID dialects. They consume a
GifOS **MediaStream** (or still frame) from the runtime.

---

## External services (examples)

| Tier | Examples | Role |
|---|---|---|
| Real-time streaming avatar | HeyGen LiveAvatar, D-ID streaming, LemonSlice | Cloud lip-sync video (often WebRTC/SDK); metered $/min |
| Batch talking-head | HeyGen video API, many “script→MP4” tools | Content apps; weak for continuous Meet tracks |
| Asset / 3D identity | Ready Player Me–style GLB URLs | Local render + mic-driven visemes; no stream vendor |
| Local only | Static image, talking GIF, canvas/VRM puppet | Zero third party after assets load |
| Voice only | Browser AudioWorklet filters; later TTS vendors | Filters/reshape mic without a face service |

v1 should work **fully offline** (local/static). Vendors are v2 adapters.

---

## Settings shape

Extend the existing third-party API pattern rather than inventing a second key
vault:

```
Settings → Presence / Avatar
  Provider:   none | local | <named API from Third-party APIs>
  Description file / icon:  avatar description (desktop file)
  Voice:      mic passthrough | filter preset | (later) provider-linked
  Preview → MediaStream
```

- **Keys** stay in Settings (per-origin `localStorage`, not in backup GIFs) —
  same as Deepgram/OpenAI.
- **Description file** holds non-secret refs: `avatarId`, model URL, poster,
  filter name, trust badge preference.
- Manifest apps that must call a vendor HTTP API still use `capabilities.api`
  + `gifos.api`; **prefer** shell-side adapters so apps only need
  `capabilities.presence` (or camera-equivalent) and never see the key.

---

## Avatar description file (`gifos.avatar/1`)

Portable, provider-agnostic sketch:

```json
{
  "schema": "gifos.avatar/1",
  "displayName": "Neon Fox",
  "kind": "static",
  "static": { "imageUrl": "face.png", "talkingGifUrl": "talk.gif" },
  "local": { "modelUrl": "", "posterUrl": "" },
  "provider": "",
  "ref": { "avatarId": "", "voiceId": "", "quality": "720p" },
  "voice": { "mode": "passthrough", "filter": "" },
  "trust": { "label": "avatar", "showBadge": true }
}
```

- `kind`: `static` | `local` | `service`.
- `provider` + `ref` used only when Settings has that named API configured.
- File can live as a desktop GIF (artwork + `.state` / sidecar JSON) so identity
  is stealable/remixable like any App GIF.

---

## Runtime seam (what Meet and apps call)

Trusted shell only:

| API (sketch) | Returns |
|---|---|
| `gifos.presence.mode()` | `camera` \| `avatar` \| `audio-only` \| … |
| `gifos.presence.profile()` | Safe subset of the description (no secrets) |
| `gifos.presence.stream()` | `MediaStream` (video ± filtered audio) |
| `gifos.presence.start` / `stop` | Session lifecycle for metered cloud avatars |

**Adapters** (in desktop/runtime, not in each app):

```text
description + Settings(provider, key)
    →  PresenceAdapter (local | static | heygen | did | …)
    →  MediaStream / ImageBitmap
    →  Meet replaceTrack  |  app canvas / UI
```

New vendor = new adapter. Meet packers, Stage, Stadium, friend-relay stay
unchanged: they only see tracks.

---

## Meet integration

- Publish path: same as blur / stage park — `replaceTrack` on the camera sender
  with the presence video track.
- Mic: optional pre-publish AudioWorklet filter; mix-minus / Stage ear unchanged.
- Tile chip when `trust.showBadge` or room policy requires “this is an avatar.”
- Pause/stop cloud avatar sessions when the tab is backgrounded or the user is
  not contributing a useful feed (cost + CPU).

Sandbox App GIFs: no vendor SDK in the opaque iframe if CSP/CORS fight it;
request stream/frames via the runtime bridge (same discipline as brokered
capture and `brokerApi`).

---

## Phased delivery

1. **Local/static only** — image/GIF/canvas → track; voice filters; Meet toggle;
   description file on the desktop. Proves the seam.
2. **Pluggable providers** — named third-party APIs + adapters; description
   `kind: "service"`; spend/stop UX for $/min streams.
3. **Festival / apps** — opt-in App GIFs; default avatar on open/low channels if
   desired; stealable avatar GIFs.

---

## Non-negotiables

- No gifos.app account or central avatar CDN required.
- **Apps never receive avatar API keys** (same as AI / third-party APIs).
- Fair-share media plane unchanged (no beefy node; one outbound video track).
- Local fallback when the provider is missing, down, or unaffordable.
- Blur/consent still apply to whatever pixels leave the device; room policy may
  require a real camera for “clear” in some admin rooms.

---

## Open questions

- Mandatory vs optional “avatar” badge in civil rooms.
- Phone CPU when many local animations run (sender cheap; receivers still one
  mosaic).
- CORS / WebRTC: token mint via `brokerApi` + proxy; media session often needs
  trusted-origin SDK code in Meet/runtime, not `gifos.api` alone.
- Moderation of user-supplied avatar art in open rooms (reuse password-gated
  file norms where relevant).
