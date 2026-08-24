# glTF Viewer

Drop a 3D model on this page and look at it. Nothing is uploaded. The last file you opened comes back the next time you open the app.

## Open a model

1. Press **Choose file**, or drag a `.glb` or `.gltf` onto the window.
2. Wait a moment. The model fills the view, framed so you can see it.
3. Drag to orbit. Scroll or pinch to zoom. Right-drag (or two fingers) to pan.

A `.glb` is one file and always works. A `.gltf` that points at extra `.bin` or image files needs those extras dropped at the same time (multi-select, or drop the folder's files together). Draco / KTX2 / Meshopt compressed files are not unpacked here — export a plain glTF from your tool and drop that.

## Look around

- **Wireframe** — see the triangles.
- **Grid** — a floor under the model.
- **Auto-rotate** — slow spin, useful while you read the tree.
- **Play** — if the file has animation clips, play or pause them.
- **Neutral light** — a local studio. There is no sky downloaded from anywhere.

The panel on the right lists nodes, meshes, materials, cameras and clips. Tap a row to flash that object.

## A live friend

Press **Invite** in the bar above the app. A friend who opens the link sits with you. Each of you drops a file on your own device; the model is not sent. There is no account.

## What is saved

The last model, its name, and the display switches (wireframe, grid, auto-rotate, light) stay on this device, inside the file. Close it, come back, they are still there.

Unofficial port of [glTF Viewer](https://github.com/donmccurdy/three-gltf-viewer) by Don McCurdy.
