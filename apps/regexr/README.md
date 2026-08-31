# RegExr

Live regex tester, cheatsheet, and reference — offline, in one GIF.

An unofficial port of **[RegExr](https://github.com/gskinner/regexr)** by
Grant Skinner and gskinner.com (GPL-3.0). Type a pattern, see matches in the
text, click the cheatsheet to insert a token. Recents and the current
pattern live in the file. Invite shares the pattern.

```
index.html             expression, text, tools, sidebar
style.css              dark chrome (regexr.com night)
tester.js              BrowserSolver match/replace/list/tests, no Worker
net.js                 invite shares pattern + text
app.js                 shell, highlights, recents, launch
icon.mjs               animated /(\\d+)/ sticker + 1200×720 cover
vendor.mjs             rebuilds vendor/ from the pinned commit
vendor/lexer.js        ExpressionLexer, classic IIFE
vendor/profiles.js     JS flavor profile
vendor/reference.js    full Reference (community catalog dropped)
vendor/cheatsheet.js   the Cheatsheet table
```

## Why this can run as a GifOS app

Upstream is Gulp + Rollup + CodeMirror + a PHP server for PCRE and the
community catalog, and the live site loads webfonts and ads. GifOS inlines
classic scripts with no network, so `vendor.mjs` converts the lexer, JS
profile, and reference to IIFEs. Matching uses the browser `RegExp` in
this tab (the BrowserSolver algorithm, no Worker). PCRE, accounts, ads,
and the community catalog are not shipped.

## capabilities

| capability | why |
|---|---|
| `db` | Current pattern/text in a `private` collection; recents private; live pattern `read-write` for Invite. |
| `multiplayer` | The room. Invite is OS chrome. |
| `launch` | A link may open onto a pattern / text / flags. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/regexr/vendor.mjs    # only when moving the upstream pin (needs net)
node apps/regexr/build.mjs     # -> site/apps/regexr/regexr.gif
```

Catalog is owned elsewhere — do not run `build-app-catalog.mjs` from this tree.

## Licence

GPL-3.0, gskinner.com, inc. The notice is packed **inside the GIF** as
`COPYING.txt` as well as living here.
