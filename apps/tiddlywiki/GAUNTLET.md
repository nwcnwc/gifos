# Gauntlet — TiddlyWiki

**Win:** A stranger who knows tiddlywiki.com uses this copy because the notebook *is* the GIF — close it and the tiddlers are still there, and one invite is a shared wiki with no server and no download-the-html dance.

## Bars

- **ONE:** tiddlywiki.com / the empty TiddlyWiki 5 HTML file (Jeremy Ruston, UnaMesa, BSD-3-Clause). Floor, not ceiling: "as good as" is losing.
- **TWO:** GifOS — `gifos.db` is the save; the file is the wiki; Invite is a shared wiki; works offline; a launch link can open a named tiddler.

## Rounds

1. **Persistence.** Empty wiki boots, tiddlers write to `tiddlers` (read-write) and the story river to `prefs` (private). Tombstones keep deletions from coming back out of the HTML store.
2. **Icon.** Stacked tiddler cards; a new page slides in and ink lines appear. Reads as a notebook at 64px.
3. **Cover.** Mid-use garden wiki: sidebar with Open/tags, two open tiddlers, not an empty first boot.
4. **Listing.** Tagline and description lead with the file-is-the-wiki / invite reason, credit Jeremy Ruston & UnaMesa, `blessed: false`.
5. **Phone.** Sidebar breakpoint 56em, 40px tap targets, 16px editor so iOS does not zoom. Back cancels an edit, then closes the top tiddler, then hides the sidebar.
6. **Markdown.** `tiddlywiki/markdown` is in the empty wiki so a note can be typed as Markdown without installing a plugin.
7. **CSP.** Boot kernel `Function()` compile is rewritten to an inline `<script>` insert so modules load under `'unsafe-inline'` with no `'unsafe-eval'`.

## Remaining gap

Upstream's plugin ecosystem (CodeMirror, KaTeX, maps, …) is not bundled — only what you need to actually write notes. A user who lives in a 40-plugin wiki still has to import those plugins themselves.
