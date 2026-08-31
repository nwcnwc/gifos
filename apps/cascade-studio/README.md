# CascadeStudio

Sketch a closed profile and extrude a **B-rep solid** with the OpenCascade
kernel, entirely inside the sandbox. An unofficial port of
[Cascade Studio](https://github.com/zalo/CascadeStudio) (Johnathon Selstad,
MIT). The last document is saved in the GIF.

OpenJSCAD (if present) is CSG. glTF Viewer displays a mesh. This is the
OpenCascade B-rep path: Sketch → Face → Extrude, the same kernel FreeCAD
uses.

## What rides where

| piece | where | bytes |
|---|---|---|
| `cascadestudio.wasm` | **in the GIF** under `.assets/` | 21,241,345 |
| rewritten `cascade-worker.js` | **in the GIF** under `.assets/` | ~375 KB |
| on-demand pins | **none** | — |

The kernel is 21 MB uncompressed, ~6.4 MB deflate — under the user-import
25 MB cap and in the same band as chess-grandmaster / vocal-remover. It
must **not** become a `data:` URL in the srcdoc (pdf-tables-ocr's lesson):
`gifos.assets()` hands the bytes over as a zero-copy transfer.

`minBuild` is **1178** (`gifos.assets()` for packed `.assets/` files).
`capabilities.wasm` is required (blob workers + `wasm-unsafe-eval` +
`connect-src blob: data:`). `connect-src` never includes a network host.

## Engine

Vendored from `cascade-core@2.0.6` (see [`vendor/UPSTREAM.txt`](vendor/UPSTREAM.txt)).
The worker is the esbuild bundle of StandardLibrary + ShapeToMesh + the
OpenCascade.js `cascadestudio` glue. `build.mjs` rewrites it to a **classic**
worker (opaque origins refuse `{type:'module'}` blob workers), injects
`wasmBinary` so nothing is fetched, and replaces Embind's `new Function`
invokers — the app CSP has `'wasm-unsafe-eval'` and not `'unsafe-eval'`.

User CAD `eval()` is not used. Sketch points go to a structured
`sketchSolid` handler that calls `Sketch` / `Fillet` / `Extrude` on `self`.

## capabilities

| capability | why |
|---|---|
| `wasm` | Instantiate the OpenCascade engine on a blob worker. |
| `db` | Last document in a `doc` collection. |
| `multiplayer` | Invite shares that document read-write. |

## Building

```
node apps/cascade-studio/build.mjs
```

Writes `site/apps/cascade-studio/cascade-studio.gif`. Do not run
`scripts/build-app-catalog.mjs` from this tree.

## Licences

Packed **inside the GIF**:

- CascadeStudio / cascade-core — MIT (`COPYING.txt`)
- Open CASCADE Technology (the WASM) — LGPL-2.1 with exception
  (`COPYING-opencascade.txt`)
