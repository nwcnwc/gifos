# Cron Speak

A cron expression, said in English. Fields named. Next times listed. Nothing is uploaded.

An unofficial port of **[cRonstrue](https://github.com/bradymholt/cRonstrue)**
by bradymholt (MIT). The translator is the app: type, read, tap a field,
see the next fire times. Close it, come back — the last expression is still there.

```
index.html              expression, field pills, English, next times
style.css               dark tool UI
cron.js                 field split, next fire, honest errors
app.js                  cronstrue.toString + CronTalk UI
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
| `launch.expr` | A link may open onto an expression. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/cron-speak/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.

## Licence

- cRonstrue — MIT (`vendor/COPYING-cronstrue.txt`)
