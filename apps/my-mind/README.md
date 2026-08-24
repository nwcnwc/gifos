# My Mind

A mind map. The map is the save.

An unofficial port of **[My Mind](https://github.com/ondras/my-mind)** by
Ondřej Žára (MIT). `my-mind.js` + `my-mind.css` vendored. Firebase, Google
Drive, WebDAV, analytics, and the Font Awesome CDN are stripped. `fetch("map.css")`
is replaced by an inlined string. The last map is saved privately.

```
index.html              shell matching upstream's ids
ls-stub.js              memory localStorage
app.js                  onReady → gifos private last map
vendor/my-mind.js       patched (see UPSTREAM.txt)
vendor/my-mind.css
vendor/map-css.js       map.css as window.MYMIND_MAP_CSS
```

## capabilities

| capability | why |
|---|---|
| `db` | Last map in a `private` collection. |

`minBuild` is **947**.

```bash
node apps/my-mind/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
