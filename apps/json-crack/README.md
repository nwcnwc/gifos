# JSON Crack

Paste JSON, see it as a graph of cards. Nothing is uploaded.

An unofficial port of **[JSON Crack](https://github.com/AykutSarac/jsoncrack.com)**
by Aykut Saraç (Apache-2.0). Upstream is Next.js; this copy is the **graph
view** as classic scripts: same node rule, left-to-right cards, pan and zoom.

```
index.html     split: textarea + graph (Text/Graph tabs on a phone)
style.css      dark studio
graph.js       object/array → card, nested → edge, tree layout
app.js         private last document, pinch/zoom, empty state
mp.js          meeting shares the same document
icon.mjs       procedural icon and the 1200×720 cover
build.mjs      packs the GIF into site/apps/json-crack/json-crack.gif
```

## Why this can run as a GifOS app

The Next/SPA (accounts, cloud, VS Code extras) is not shipped. The graph is
the product. The document is stored in a **private** collection. Press
**Invite** (OS chrome) to show the same document in a meeting.

## capabilities

| capability | why |
|---|---|
| `db` | Last document in a `private` collection; the meeting copy in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/json-crack/build.mjs   # -> site/apps/json-crack/json-crack.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

The Apache-2.0 notice is packed **inside the GIF** as well as living here:

- JSON Crack — Apache-2.0 (`vendor/COPYING-jsoncrack.txt`)
