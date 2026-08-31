# RegExr gauntlet

**Win:** A stranger who knows regexr.com uses this one because it works offline, the pattern and test text live in the file, and one Invite shares the live expression — no account.

## Bars

- **ONE:** [regexr.com](https://regexr.com) — live matches, cheatsheet, reference, tools (Replace / List / Details / Explain), Tests, hover details.
- **TWO:** works offline; pattern+text persist in the GIF; Invite is multiplayer; no account.

## Pieces

| piece | bar | status |
|---|---|---|
| ICON | `/(\\d+)/` matching digits lighting up at 64px | in |
| STORE ART | mid-use default `([A-Z])\\w+` with matches and cheatsheet | in |
| LISTING COPY | leads with file-is-the-save / offline / invite | in |
| Live matches | gold wash on the hit, letters stay readable (persistME_42 in the text) | in |
| Cheatsheet + Reference | vendored from upstream, click to insert | in |
| Tools | Replace, List, Details, Explain | in |
| Tests | match any / full / none | in |
| Recents + persist | gifos.db save + recents | in |
| Invite | guest lands on the host's live expression; later edits last-write-wins | in |

## Rounds

1. First build: lexer + JS profile + reference vendored, tester without Worker, dark chrome, recents, invite, launch.
2. Cover and icon judged against regexr.com's own default capitalized-word shot — not an empty boot.
3. Phone: sidebar is a drawer (Menu), Back closes it, tests and tools stack.
4. Matches no longer redact the text (`#textHl mark.match` is ink on gold). Guest on Invite adopts the host's live row instead of publishing the sample over it.

## Remaining gap

Upstream's CodeMirror editors, PHP/PCRE engine, and community pattern catalog are not in the sandbox; this copy is JavaScript-only, with recents instead of a server-side library. Distinct from `apps/regexper` (railroad diagrams).
