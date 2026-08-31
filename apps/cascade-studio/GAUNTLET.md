# CascadeStudio gauntlet

**Win:** Sketch a profile, pull it into a real OpenCascade solid, and the
part lives in the GIF — no FreeCAD install, no account, works on a plane.

## Bars

- **ONE** — CascadeStudio / FreeCAD. B-rep CAD, not CSG, not a mesh viewer.
- **TWO** — the model lives in the GIF; works offline.

## Rounds

1. **Kernel size.** `cascadestudio.wasm` is 21,241,345 bytes (~6.4 MB
   deflate). Not an abort: ships in-GIF under `.assets/` like Squoosh's
   codecs, not a 50 MB full OCCT dump.
2. **Sandbox.** Classic blob worker, `wasmBinary`, Embind `new Function`
   stripped. Sketch→solid is a structured RPC, not `eval` of editor text.
3. **Product.** Sketch plane + height + corner fillet + sample bracket.
   Last document in `gifos.db('doc')`. Invite shares the sketch.
4. **Face.** Icon draws a profile then extrudes it. Cover is the plate
   mid-orbit with the sketch beside it. Tagline leads with the GIF.

## Remaining gap

The upstream IDE (Monaco, OpenSCAD mode, STEP/IGES import, 3D fillets,
history timeline) is not in this GIF. A stranger who wants a full
scripted kernel still has zalo's site; a stranger who wants a part in
their pocket has this.
