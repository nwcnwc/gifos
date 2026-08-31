# Carbon

Pretty images of source code, as a GifOS app. Solo it is carbon.now.sh
without an account: theme, language, background, window chrome, export PNG.
The snippet and the theme live in the file. Invite puts a friend on the
same snippet.

Themes and the default `pluckDeep` snippet come from
**[carbon-app/carbon](https://github.com/carbon-app/carbon)** (MIT). The
Next.js / CodeMirror tree is not vendored — it will not run in an opaque
srcdoc with no network. `vendor/themes.js` is their colour tables;
`vendor/syntax.js` is a small tokenizer mapped onto those keys.

```
index.html           toolbar, the window, settings / recents sheets
style.css            Carbon chrome (#121212, yellow export, traffic lights, Hack)
vendor/themes.js     THEMES, DEFAULT_CODE, DEFAULT_BG from lib/constants.js
vendor/syntax.js     highlighter → Carbon highlight keys
vendor/fonts/        Hack Regular + Italic (latin subset) + COPYING-hack.txt
app.js               editor, PNG canvas export in Hack, recents, file drop
net.js               invite shares the live snippet + theme (guest joins it)
icon.mjs             sticker icon + 1200×720 cover
build.mjs            packs site/apps/carbon/carbon.gif
```

## Why this can run as a GifOS app

Upstream is a Next.js site that talks to a snippet API. This copy never
fetches. Highlighting, themes, and PNG export are all local. `connect-src
'none'` costs it nothing.

## capabilities

| capability | why |
|---|---|
| `db` | Current snippet (private `save`), recents (private), live room (read-write). |
| `multiplayer` | Invite is OS chrome. Guests edit the same snippet. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/carbon/build.mjs   # -> site/apps/carbon/carbon.gif
```

## Licence

MIT, Carbon. The notice is packed **inside the GIF** as
`COPYING-carbon.txt`. Hack’s notice is `COPYING-hack.txt`.
