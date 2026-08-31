# TiddlyWiki

[TiddlyWiki 5](https://tiddlywiki.com) by Jeremy Ruston and the UnaMesa Association
(BSD-3-Clause) as an ordinary sandboxed GifOS app. The original thesis is that
the wiki **is** one HTML file. Here the wiki **is** the GIF: every tiddler is
written to `gifos.db`, so closing the app, sharing the file, or pressing
Invite are all the same notebook.

Upstream still offers a “download a new HTML file” save. This copy does not
use it. A no-op saver wins over the download saver so the in-wiki save button
cannot dump a 2 MB file; the OS Save button is how you snapshot the GIF.

```
boot.js           gifos.db persist, invite apply, Back, launch
style.css         phone tap targets, 16px editor (no iOS zoom)
vendor.mjs        pin TiddlyWiki5 v5.4.1, build empty+markdown, gzip wiki HTML
vendor/wiki.html.gz
vendor/UPSTREAM.txt
icon.mjs          stacked tiddler cards, and the 1200×720 cover
build.mjs         packs site/apps/tiddlywiki/tiddlywiki.gif
```

## Why this can run as a GifOS app

TiddlyWiki empty is one self-contained HTML document (boot kernel + core
plugin + vanilla/snowwhite). Nothing to fetch. `window.$tw.boot.suppressBoot`
lets `boot.js` preload tiddlers from `gifos.db` before the first paint, then
call `$tw.boot.boot()`. A change listener writes user tiddlers back. Invite
is `data.tiddlers` at `read-write`; the story river stays in `prefs` so each
person keeps their own open tabs.

The sandbox CSP has no `'unsafe-eval'`. Upstream compiles every JS module
with `Function("return "+code)`. `vendor.mjs` rewrites that one call in
`$:/boot/boot.js` to insert a classic `<script>` (legal under
`'unsafe-inline'`) and read the function back.

Markdown (`tiddlywiki/markdown`, markdown-it) is bundled so a note can be
typed as Markdown without a plugin dance.

## capabilities

| capability | why |
|---|---|
| `db` | Tiddlers in a `read-write` collection; StoryList / UI state `private`. |
| `multiplayer` | Invite is a shared wiki. No server. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

`launch.tiddler` opens a named tiddler from a link.

## Building

```bash
node apps/tiddlywiki/vendor.mjs   # network; only to move the pin
node apps/tiddlywiki/build.mjs    # -> site/apps/tiddlywiki/tiddlywiki.gif
```

## Licence

BSD-3-Clause, Jeremy Ruston and the UnaMesa Association. The notice is packed
**inside the GIF** as `COPYING.txt`. The Markdown plugin vendors markdown-it
(MIT); its notice rides in the plugin’s own license tiddler inside the wiki.
