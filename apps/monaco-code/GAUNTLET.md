# Monaco Code gauntlet

**Win:** A stranger who knows the Monaco playground uses this one because the buffers live in the GIF, it works on a plane, and one Invite is a pair editor — no account, no npm, no CDN workers.

## Bars

- **ONE:** [VS Code](https://code.visualstudio.com) / the [Monaco playground](https://microsoft.github.io/monaco-editor/playground.html) — IntelliSense, JSON validation, Find, format, minimap, dark theme.
- **TWO:** the buffer lives in the GIF; invite is a pair editor; works offline. No CDN workers — workers from GIF bytes as blob URLs.

## Pieces

| piece | bar | status |
|---|---|---|
| ICON | reads as a code editor at 64px; animation types syntax and a second caret | in |
| STORE ART | mid-use TypeScript + file tree + IntelliSense + a friend’s caret | in |
| LISTING COPY | leads with file-is-the-save / invite pair / offline | in |
| Monaco subset | JS/TS IntelliSense, JSON, Markdown, file tree | in |
| Workers | blob Workers from packed GIF bytes, classic (no type:module) | in |
| Persist | gifos.db files collection; sample project on first boot | in |
| Invite | read-write pair, remote carets, last write wins | in |
| Phone | Files drawer, wrap on, edit + save | in |

## Rounds

1. Vendor monaco-editor 0.52.2 (editor + basic languages + JSON/TS services). Workers as classic IIFE, served from `.assets/` via gifos.assets().
2. File tree + models + sample project. Autosave. Invite pair + remote carets.
3. Icon types syntax then a second caret. Cover is mid-use hello.ts, not empty boot.
4. Phone: Files drawer, 40px taps, wrap on, Back closes drawer then menus.

## Remaining gap

Monaco playground’s extra HTML/CSS language-service workers are omitted (those languages still highlight). Pair editing is last-write-wins per file, not character-level OT.
