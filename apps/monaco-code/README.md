# Monaco Code

VS Code’s editor, as a GifOS app. The buffers live in the GIF; one Invite
is a pair session; it works offline.

Unofficial port of the **[Monaco Editor](https://github.com/microsoft/monaco-editor)**
by Microsoft (MIT). Vendors monaco-editor **0.52.2**, bundled to classic
scripts. Language-service workers (editor / JSON / TypeScript) are minted
from GIF bytes as `blob:` URLs — nothing is fetched at runtime.

```
index.html style.css
workers.js               MonacoEnvironment.getWorker → blob Worker
app.js                   file tree, models, phone chrome
net.js                   pair files + remote carets
vendor/monaco.js         editor + basic languages + JSON/TS services
vendor/monaco.css        editor CSS, codicon font inlined
vendor/*.worker.js       classic IIFE workers
build.mjs                packs site/apps/monaco-code/monaco-code.gif
vendor.mjs               rebuild vendor/ from the pinned npm tarball
```

## capabilities

| capability | why |
|---|---|
| `db` | Files in a `read-write` collection (the file is the save *and* the pair buffer). Theme in `private` prefs. |
| `multiplayer` | Invite. Remote carets on `cursors`. |
| `wasm` | `worker-src blob:` so Monaco’s language workers can run. |

`minBuild` is **1178** — `gifos.assets()` for packed `.assets/` worker files.

## Building

```bash
node apps/monaco-code/vendor.mjs   # only when moving the monaco pin
node apps/monaco-code/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
