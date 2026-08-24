# My Mind

A mind map. The file is the map.

An unofficial port of **[My Mind](https://github.com/ondras/my-mind)** by
Ondřej Žára (MIT). `my-mind.js` + `my-mind.css` vendored. Firebase, Google
Drive, WebDAV, analytics, and the Font Awesome CDN are stripped. `fetch("map.css")`
is replaced by an inlined string. The last map is saved privately. Invite
shows the same map to a friend (OS chrome — no in-app Invite button).

```
index.html              shell matching upstream's ids + phone bar
ls-stub.js              memory facade; named maps dump into gifos private save
app.js                  onReady → last map; phone tap-to-edit; node helpers
mp.js                   room: a friend watches the same map
vendor/my-mind.js       patched (see UPSTREAM.txt)
vendor/my-mind.css
vendor/map-css.js       map.css as window.MYMIND_MAP_CSS
```

## capabilities

| capability | why |
|---|---|
| `db` | Last map in a `private` collection. Named maps from Open/Save as dump here too. |
| `multiplayer` | `room` is the live map a friend watches. Invite is OS chrome. |

`minBuild` is **947**.

```bash
node apps/my-mind/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
