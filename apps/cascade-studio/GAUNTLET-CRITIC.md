# CascadeStudio gauntlet critic

Blind run of the shipped GIF (`site/apps/cascade-studio/cascade-studio.gif`, 9,301,665 bytes) in the real GifOS sandbox (desktop 1100×820), the store listing at `/store/cascade-studio`, and the packed OpenCascade worker extracted from that GIF. Compared against [Cascade Studio](https://zalo.github.io/CascadeStudio/) (zalo/CascadeStudio, OCCT 8.0, cascade-core 2.0.6) and against FreeCAD as the B-rep floor. Distinct from OpenJSCAD (CSG) and glTF Viewer (mesh display).

**Winner: COMP**

Sketch→solid **does** produce a mesh. The kernel in this GIF built the sample plate as **10 faces, 24 edges, 92 triangles** (Node, 1.3 s from packed `.assets/`) and the sandbox HUD read **`92 triangles · Solid ready.`** A cyan filleted block with white B-rep edges painted in WebGL; dragging the view orbited it; raising Height from 12 to 30 made the block taller (bright cyan pixels in the view 15,716 → 21,002). That is OCCT, not JSCAD CSG and not a dropped glTF.

A stranger who knows CascadeStudio or FreeCAD still has no reason to use this copy. The listing's reason is a sketch you can draw, a part that lives in the GIF, and Invite sharing that sketch. After a cold run they can **orbit a sample they did not make**, and they cannot reach the plane they are told to tap.

## Stranger-reason

Asked: you know CascadeStudio / FreeCAD — why would you use this one?

The listing's answer is "no FreeCAD," "the model lives in the file," "tap the plane," "a bracket plate is already open," "Invite… a friend lands on the same sketch." After a cold run:

- **The kernel is real.** Packed `cascadestudio.wasm` is 21,241,345 bytes, magic `\0asm`. The rewritten worker has `sketchSolid` (structured RPC: `Sketch` → `Fillet` → `Face` → `Extrude` → `combineAndRenderShapes`) and **no** `eval`, `new Function`, or `import.meta`. User CAD `eval` is stubbed to `throw "sketchSolid only"`. Same pin as upstream cascade-core 2.0.6.
- **The sketch plane is not on screen.** Four desktop screenshots, left 340 px: **0** pixels above (80,80,80), **0** cyan, **0** white — no grid, no points, no Undo/Close/Clear/Sample, no Height/Corner. Playwright's click on `#clear` (the button exists in the DOM) died on `#boot` intercepting pointer events. `#boot { display: flex }` is author CSS; there is no `[hidden] { display: none }` (wifi-card has the `!important` form). `boot.hidden = true` does not win. The WebGL canvas punches through the overlay; the 2D chrome does not.
- **No STEP, no STL, no OBJ.** Upstream's bar is "export `.step` / `.stl` / `.obj`." The packed worker still has `messageHandlers.saveShapeSTEP`. `engine.js` never calls it. The HUD counts triangles. The listing says "not a triangle soup." Without a B-rep file, the only solid that leaves this app is a screenshot of 92 triangles.
- **The "bracket" is a rounded rectangle.** `SAMPLE_PLATE` is `[[0,0],[40,0],[40,24],[0,24]]`, radius 6, height 12 — four lines, no holes. FreeCAD's Part Design hole/pocket is not here. OpenJSCAD's sibling at least subtracts a CSG hole in its cube sample.
- **Invite was not a second kernel on this box.** OS chrome shows Invite. Manifest is `data.doc.visibility: "read-write"` and `boot.js` `db.subscribe`s that collection. That is the right shape. It was not run host→guest (21 MB WASM × 2). Do not award a round that was not measured.

CascadeStudio's reason is still true and still the one a CAD user can say: write `Sketch`/`Extrude`/`Difference` in the IDE, Save STEP, paste the URL. FreeCAD's reason is the same kernel with a sketcher, constraints, and a file you can machine from. This port took the IDE and the file away and did not replace them with a plane you can touch.

## Single biggest remaining gap

**The boot overlay never yields the sketch, so the product loop is unusable even though the kernel meshed.**

`#boot` is `position: absolute; inset: 0; display: flex` with an opaque radial gradient. Sibling apps that use `hidden` ship `[hidden] { display: none }`. This one does not. After `Kernel ready.` the iframe property `boot.hidden` is true and `#app` is showing, but:

- left pane paint is a dark gradient only (histogram identical on boot, first solid, height-30, and orbit);
- `#boot` is still the hit target over `#clear`;
- the only thing a user sees is a filleted sample they cannot edit, over a dead panel.

Until `#boot` is actually `display: none` and the sketch canvas, sliders, and buttons paint, every other piece (Invite, "the part is the GIF", "tap the plane") is copy over a hole. The 92-triangle solid is the kernel working. It is not the app working.

## Piece judgements

### Kernel / sketch→solid — OURS (the one round that is real)

Packed-in-GIF worker, Node:

| | |
|---|---|
| boot | 720 ms to `startupCallback` |
| `sketchSolid` sample plate, fillets 6, height 12 | `true` at 964 ms |
| `combineAndRenderShapes` maxDeviation 0.15 | **10 faces, 24 edges, 92 tris, 112 verts** at 1264 ms |

Sandbox, same GIF, abilities modal dismissed:

- Kernel ready in ~5 s, then `Triangulating Faces…` then **`92 triangles` / `Solid ready.`**
- `gifos.db('doc')` row `{ points:[[0,0],[40,0],[40,24],[0,24]], closed:true, radius:6, height:12 }`.
- Height 30: HUD still 92 tris (prism tessellation can sit still); the block **got taller**.
- Drag-orbit moved the camera (right-pane bright pixels 15,716 → 22,774).

That is OpenCascade B-rep tessellated for display. OpenJSCAD is `@jscad/modeling` CSG. glTF Viewer parses a dropped `.glb`. Different jobs. This round is not those apps.

### Icon — COMP (barely readable)

12 frames, 128², GIF89a, procedural profile-then-extrude on a dark rounded card. At Home Screen size the installed `Cascade.gif` read as a **black square** with a NEW chip, overlapping Welcome — not a sketch becoming a solid. The loop is the right idea (the job, not a wiggle). It does not survive 64 px. CascadeStudio's site is a favicon; FreeCAD has a real mark. This is not yet either.

### Cover — COMP

`cover.jpg` / `screenshot.png` are the same 1200×720 **illustration**: sharp-corner hollow isometric box, sketch a cyan rectangle, two slider bars with no labels. It is not a frame of the running app.

- Listing hero (~678×407): readable as "CAD split view." The solid is a **wireframe tray**, not the shaded filleted plate first boot actually builds.
- Grid card: the hollow box still scans; the sketch dies.

Worse: cover shows sharp corners and a cavity. First successful mesh is a **closed, filleted, shaded** 40×24×12 plate. A cover that is both not a screenshot and wrong about the part loses to zalo's live viewport.

### Listing — COMP (overclaim = failed round)

Rendered listing matches `listing.json`. Tagline is a good card line. Credits are honest (unofficial, bugs to GifOS, Johnathon Selstad, signed gifos.app, 8.9 MB, minBuild 1178, abilities db / wasm / multiplayer). "Unofficial port of CascadeStudio" pill is correct.

Lead claims against the running GIF:

| claim | running build |
| --- | --- |
| "Tap the plane to draw a closed profile" | plane does not paint; `#boot` eats the click |
| "a bracket plate is already open so you can orbit" | **orbit yes**; "bracket" is a rounded rectangle with no holes |
| "OpenCascade builds a real solid — not a triangle soup" | 10 OCCT faces, then the HUD says **92 triangles**; no STEP out |
| "Close it and the last sketch is still there; share the GIF and the model goes with it" | `doc` row is written (sample). Reopen and GIF-roundtrip of a **user** sketch were not shown, because a user cannot sketch |
| "Press Invite… a friend lands on the same sketch. Either of you can move a point" | Invite is OS chrome (present). Host→guest **not run**. Do not award |

The original's on-page copy (script in the editor, Save STEP, URL is the model) is still the better listing because it is true.

### Sketch UX — COMP

Intended: left pane is the XY plane (5 mm grid, tap points, Close, uniform Corner fillet, Height 1–60). That DOM exists (`#sketch`, `#undo`, `#close`, `#clear`, `#sample`, two ranges). It does not appear.

What appears: a dark left column and a WebGL solid. Height was changed only through `input` events in the driver, not by a visible slider. `#clear` is not clickable. A stranger cannot perform the loop the icon advertises.

Even if the overlay were fixed, this is still not CascadeStudio's Sketch API (`LineTo` / `ArcTo` / `BSplineTo` / plane `'XZ'` / `Revolve`) and not FreeCAD's Sketcher (constraints, dimensions, pad/pocket). Polyline + one radius + one height. Floor for a demo; loss against bar ONE.

### Part-in-GIF — COMP

Kernel **is** in the GIF (`.assets/cascadestudio.wasm` + rewritten `.assets/cascade-worker.js`; `index.html` does not fetch them). `connect-src` has no host. That half of bar TWO holds.

The **part** that is supposed to live in the file is a sketch JSON in `gifos.db('doc')`, not a B-rep. Close the worker and the OCCT shape is gone. Share the GIF and you share the recipe — if a recipe was ever saved from a plane the user could touch. Upstream serialises the **code** in the URL and writes STEP. OpenJSCAD's sibling at least downloads STL. This GIF has the writer in the worker and no button.

### Invite shares sketch — COMP (unrun, not a pass)

Wiring: `capabilities.multiplayer`, `data.doc` read-write, `db.put` / `db.subscribe` on `id:'doc'`. Invite is not drawn by the app (correct). A second client was not stood up. A round you did not run is not a win.

### Phone — no verdict

`@media (max-width: 720px)` stacks the panel and hides `#orbit`. Not opened at 390×844 (second Chromium + second 21 MB instantiate). Do not guess.

### No CDN — OURS (wall held)

App-frame traffic stayed on the origin serving `site/`. WASM arrives through `gifos.assets()`, not `locateFile("./cascadestudio.wasm")`. The rewrite injects `wasmBinary` / `instantiateWasm`. Upstream CascadeStudio is a website that loads that kernel from the page. This copy does not phone home.

## Wall breaks

- **No remote load.** Held.
- **unsafe-eval.** Held. Embind `new Function` and user `eval(payload.code)` are stripped at pack; leftover either would fail `build.mjs`.
- **Saved data in gifos.db.** Collection is declared and the sample row was written. A user edit was not, because the plane is unreachable. Partial.
- **Listing truth.** Failed round. "Tap the plane" and "not a triangle soup" and "bracket" are overclaim, not tone.
- **minBuild 1178 / wasm / unofficial `blessed:false` / MIT + LGPL-2.1 notices inside the GIF.** Honest on paper.
- **Invite is OS chrome.** Correctly not drawn by the app. Irrelevant until a guest is measured.

## Distinct from the other two 3D apps

- **OpenJSCAD** — JavaScript CSG (`@jscad/modeling`), script in a textarea, STL from triangles. No OCCT, no fillets-as-faces. This GIF's 10 faces / 24 edges are a B-rep tessellation. Same store category, different kernel. Do not merge them.
- **glTF Viewer** — Don McCurdy's three.js viewer; drop a `.glb`, orbit it. No sketch, no solid, no kernel. This app generates the mesh. Do not merge them.

## Bar check

Bar ONE (CascadeStudio / FreeCAD) is not mediocre. CascadeStudio is a live-scripted OCCT IDE: Monaco, OpenSCAD mode, booleans, revolve/loft/pipe, history, STEP/IGES/STL in, STEP/STL/OBJ out, URL as share. FreeCAD is that kernel with a constrained sketcher. "As good as" would already lose on a port. This is a one-shot polyline extrude with the IDE, the file, and the plane stripped — and the remaining plane does not paint.

Bar TWO is why this should have won: kernel in the GIF (it is), last sketch in `gifos.db` (sample row only), Invite shares `doc` (wired, unrun). The stranger cannot sketch. That is the bar.

Until `#boot` actually hides and the 2D pane paints, the honest product is "orbit a 92-triangle sample of OpenCascade, offline." That is a demo of the hatch, not a CAD app, and it is not a reason to leave zalo's site or FreeCAD.
