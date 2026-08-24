# Cron Speak

A cron expression, said in English. Nothing is uploaded.

An unofficial port of **[cRonstrue](https://github.com/bradymholt/cRonstrue)**
by bradymholt (MIT). Library wrap: the translator is the app.

```
index.html              expression, chips, English sentence
style.css               dark tool UI
app.js                  cronstrue.toString, private last expression
mp.js                   optional meeting: read-only view
icon.mjs                procedural sticker and the 1200×720 cover
build.mjs               packs site/apps/cron-speak/cron-speak.gif
vendor/cronstrue.js     v3.24.0 UMD, MIT, pinned
```

## capabilities

| capability | why |
|---|---|
| `db` | Last expression in a `private` collection; the meeting view in a `read-only` one. |
| `multiplayer` | The room. Invite is OS chrome. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/cron-speak/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.

## Licence

- cRonstrue — MIT (`vendor/COPYING-cronstrue.txt`)
