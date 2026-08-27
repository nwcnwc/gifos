# glTF Viewer

Open a 3D model on this page and look at it. The last file you opened comes back the next time you open the app (if it fits in the file — about 8 MB).

## Open a model

1. Press **Choose file** / **Open**, or drag a `.glb` or `.gltf` onto the window.
2. Wait a moment. The model fills the view, framed so you can see it.
3. Drag to orbit. Scroll or pinch to zoom. Right-drag (or two fingers) to pan. **Reset** puts the camera back.

A `.glb` is one file and always works. A `.gltf` that points at extra `.bin` or image files needs those extras selected at the same time (multi-select). Draco / KTX2 / Meshopt compressed files are not unpacked here — export a plain glTF from your tool and open that.

## Look around

- **Wireframe** — see the triangles.
- **Grid** — a floor under the model, sized to it.
- **Auto-rotate** — slow spin, useful while you read the tree.
- **Skeleton** — bones, if the file is skinned.
- **Play / Pause** — if the file has animation clips.
- **Neutral light** — a local studio. There is no sky downloaded from anywhere.

The inspect panel lists nodes, meshes, materials, cameras and clips. Tap a row to flash that object. On a phone, **Inspect** slides the panel up; the Back button closes it.

## A live friend

Press **Invite** in the bar above the app. A friend who opens the link sits with you. Each of you opens a file on your own device; the model is not sent.

## What is saved

The last model (when it fits), its name, and the display switches stay on this device. Close it, come back, they are still there.

Unofficial port of [glTF Viewer](https://github.com/donmccurdy/three-gltf-viewer) by Don McCurdy.
