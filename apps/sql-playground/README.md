# SQL Playground

SQLite you can query on this device. The database is the file; Invite shares it.

An unofficial port of **[sql.js](https://github.com/sql-js/sql.js)** (MIT) —
SQLite compiled to WebAssembly. Their GUI at sql.js.org is not shipped. This
directory is a playground surface around the engine: schema list, query box,
results table, a tiny Chinook-style sample, and the database saved in the
app file. Instantiated from packed bytes as a `blob:` URL (`capabilities.wasm`).

```
index.html
style.css
sample.js              tiny music-shop SQL (artists / albums / tracks / invoices)
engine.js              sql.js from bytes + schema / exec helpers
mp.js                  guest/host status for the shared file collection
boot.js                chrome, persist, Open/Save, launch.sql
vendor/sql-wasm.js     sql.js 1.14.2 glue
vendor/sql-wasm.wasm   SQLite wasm, pinned
```

## capabilities

| capability | why |
|---|---|
| `db` | SQLite bytes in a `read-write` `file` collection (invite shares the db); last query in a `private` `prefs` collection. |
| `wasm` | sql.js from packed bytes, blob URL, no network. |
| `multiplayer` | The room. Invite is OS chrome. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

```bash
node apps/sql-playground/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
