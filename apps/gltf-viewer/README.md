# glTF Viewer

Drop a `.glb` or `.gltf`, orbit it, inspect the scene. Nothing is uploaded.

An unofficial port of **[three-gltf-viewer](https://github.com/donmccurdy/three-gltf-viewer)**
by Don McCurdy (MIT), with **three.js** r176 (MIT). Remote HDR skies, the
validator, and Draco/KTX2/Meshopt decoder fetches are stripped.

```
index.html              shell: dropzone, inspect panel
style.css               dark studio UI
viewer.js               orbit, lights, parse-from-bytes (no fetch)
app.js                  private last model, Invite copy
icon.mjs                procedural icon and the 1200×720 cover
build.mjs               packs the GIF into site/apps/gltf-viewer/gltf-viewer.gif
vendor/three-viewer.js  three + GLTFLoader + OrbitControls + RoomEnvironment, IIFE
```

## Why this can run as a GifOS app

Upstream is a Vite page that loads HDR from Google Cloud and decoders from
unpkg. The GifOS port never leaves the device: GLB bytes are parsed in memory,
textures paint through `img-src data:/blob:`, lighting is a local RoomEnvironment.
The last model is stored in a **private** collection. Press **Invite** (OS chrome)
to look together — each person drops their own file.

## capabilities

| capability | why |
|---|---|
| `db` | Last model in a `private` collection. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws a share button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**. No
`wasm` — loaders are patched so they never `fetch`.

## Building

```bash
node apps/gltf-viewer/vendor.mjs   # only when the three.js pin moves
node apps/gltf-viewer/build.mjs    # -> site/apps/gltf-viewer/gltf-viewer.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

Both notices are packed **inside the GIF** as well as living here:

- three-gltf-viewer — MIT (`vendor/COPYING-gltf-viewer.txt`)
- three.js — MIT (`vendor/COPYING-three.txt`)
