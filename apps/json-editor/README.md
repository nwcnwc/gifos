# JSON Editor

Tree and code editor. Close it, come back — the document is still there.

An unofficial port of **[JSONEditor](https://github.com/josdejong/jsoneditor)**
by Jos de Jong (Apache-2.0). Vendors the **dist** bundle (not the npm
workspace). Icon sprite inlined as a data URL so nothing is fetched.

```
index.html
style.css
app.js                     parse / format / repair, private last document
mp.js                      optional meeting: read-only watch
vendor/jsoneditor.min.js   dist, Apache-2.0, pinned
vendor/jsoneditor.min.css  dist CSS with icons inlined
build.mjs                  packs site/apps/json-editor/json-editor.gif
```

## capabilities

| capability | why |
|---|---|
| `db` | Last document in a `private` collection; the meeting copy in a `read-only` one. |
| `multiplayer` | The room. Invite is OS chrome. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/json-editor/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
