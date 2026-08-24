# fend

Unit-aware notepad calculator. The pad is the save.

An unofficial port of **[fend](https://github.com/printfn/fend)** by printfn
(MIT). The engine is the published `fend-wasm-web` 1.5.8 wasm, instantiated
from bytes (`capabilities.wasm`). Glue converted from ESM to a classic IIFE;
`new Function` (wasm-bindgen global lookup) is stubbed to `window`.

```
index.html
style.css
app.js                 REPL + private last pad + phone keypad
fend-wasm.js           generated: window.FEND_WASM_B64
vendor/fend_wasm.js    wasm-bindgen glue, patched
vendor/fend_wasm_bg.wasm
```

## capabilities

| capability | why |
|---|---|
| `db` | Last pad in a `private` collection. |
| `wasm` | fend engine compiled to WebAssembly, from bytes. |

`minBuild` is **947** (wasm is older than the store). No network path: currency
conversions fail with the engine's own "not available" message.

```bash
node apps/fend/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
