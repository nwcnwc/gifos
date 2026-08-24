# JSON Diff

Paste two documents, see the difference. Nothing is uploaded.

An unofficial port of **[jsondiffpatch](https://github.com/benjamine/jsondiffpatch)**
by benjamine (MIT). Classic UMD pin of v0.5.0 — later releases dropped the
browser bundle.

```
index.html                    two paste boxes + visual pane
style.css                     dark chrome, formatter colour overrides
app.js                        parse, diff, private last pair
mp.js                         optional meeting: read-only view
icon.mjs                      procedural sticker and the 1200×720 cover
build.mjs                     packs site/apps/json-diff/json-diff.gif
vendor/jsondiffpatch.umd.js   v0.5.0 UMD, MIT, pinned
vendor/html.css               visual formatter styles
```

## capabilities

| capability | why |
|---|---|
| `db` | Last pair in a `private` collection; the meeting pair in a `read-only` one. |
| `multiplayer` | The room. Invite is OS chrome. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/json-diff/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.

## Licence

The notice is packed **inside the GIF** as well as living here:

- jsondiffpatch — MIT (`vendor/COPYING-jsondiffpatch.txt`)
