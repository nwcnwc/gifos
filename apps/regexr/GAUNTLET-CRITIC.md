# RegExr — gauntlet critic

Bar ONE is [regexr.com](https://regexr.com) (Grant Skinner / gskinner.com): live matches in the text, CodeMirror editors, JS **and** PHP/PCRE, Cheatsheet / Reference / Community, Tools, Tests, Sign in. Driven live. Distinct from `apps/regexper` (railroad diagrams; store search for `regexper` finds that one, search for `regexr` finds this one).

Bar TWO is the platform: offline, the pattern lives in the GIF, one Invite shares it, no account.

Judged on the packed GIF `site/apps/regexr/regexr.gif` (190 KB, signed) in the real sandbox (`run.html#id=`), desktop 1280×800 and phone 390×844, `/store.html#app=regexr`, Home Screen sticker frames, persist across reopen, two contexts on one Invite link, and regexr.com in the same Chromium. One Chromium at a time.

**Winner: COMP**

**Single biggest remaining gap:** Roll-over is leftover Handlebars. Hover on `[A-Z]` paints `Matches a character in the range {{getChar(prev)}} to {{getChar(next)}} (char code {{prev.code}} to {{next.code}}). {{getInsensitive()}}`. Explain dumps the same string as a row. regexr.com’s Explain on the same default is nested English: `A-Z Range. Matches a character in the range "A" to "Z" (char code 65 to 90). Case sensitive.` The sample still says “Roll over matches or the expression for details.” Until a token becomes a sentence, COMP wins the other half of what RegExr is for. Matches now stay ink-on-gold; that is no longer the gap.

**Stranger-reason:** I know regexr.com. I would open this one on a plane, and because close-and-reopen left me on `persistME_42` / “persistME_42 lives in the file” with no account, and because Invite landed Cleo on `/fromHOST_99/` with chrome “shared with the meeting by Hana.” regexr.com cannot do that. I will still open regexr.com when I need to know what `[A-Z]` *means*.

**Wall breaks:**

- **Catalog (held).** `site/apps/index.json` lists `regexr` (201 apps). Store search for “regexr” paints one card, slug `regexr`. Search for “regexper” paints the railroad app, slug `regexper`. Deep-link `#app=regexr` loads the listing. The grid a stranger browses now has it.
- **GPL-3.0 (held).** Packed GIF contains `COPYING.txt` (GNU GPL v3, 35 KB). Listing fact is GPL-3.0. `listing.basedOn.blessed` is false; unofficial-port pill is on the page. Corresponding source is the JS in the GIF.
- **No CDN (held).** App iframe: zero requests off `127.0.0.1:8099`. Packed HTML has no `http://`. Fonts are `system-ui` + `ui-monospace`. Manifest has no `network`. Comp loads `fonts.googleapis.com` / Roboto Condensed + Source Code Pro, `google-analytics.com`, `cdn.carbonads.com`, `ad.doubleclick.net`, Cloudflare insights.
- **gifos.db persist (held).** Typed `persistME_42` against “persistME_42 lives in the file”, closed the tab, reopened the same `fileId`: pattern, text, flags `g`, 1 match, gold letters still there. Status: “The pattern lives in this file.” Recents Keep stored `/persistME_42/g`.
- **Invite is OS chrome (held).** No in-app Invite button. `#appinvite` minted `/run.html#s=regexr.…`. Guest chrome: “shared with the meeting by Hana.”
- **Offline (held).** Phone `setOffline(true)` still matched `OFFLINE_ok\d+` → `OFFLINE_ok99`.

---

## Pieces

### tester+matches — OURS (the glyphs)

Blind, same default `/([A-Z])\w+/g`:

- Comp: 27 matches, letters still there, pale-blue wash, CodeMirror × 3, flavor chip JavaScript / Flags, 27 matches (0.5ms).
- Ours: 23 matches on the shortened sample (Invite / Recents / “this copy runs JavaScript”), **ink on gold** (`mark.match` color `rgb(232,234,237)` on `rgba(255,210,70,.42)`). First marks: `RegExr`, `Edit`, `Expression`, `Text`, `Roll`, `This`, `JavaScript`, `RegExp`. The textarea is `color: transparent`; the overlay carries the glyphs. Phone `\d+` on `ab 12 cd 345` is `ab 12 cd 345`, not slabs.

Replace `$1` → `R was created by…`. List printed the capitalized words, one per line. Clicking a match opened Details (`match 1 RegExr / group 1 R`) and a selected outline. Cheatsheet click appended `.`. Flag `g` lit. JS-only is honest.

The Text pane is no longer the gap.

### hover+explain — COMP

The sample *promises* roll-over. What you get:

- Expression hover at `[A-Z]`: leftover `{{getChar(prev)}}` / `{{getChar(next)}}` / `{{prev.code}}` / `{{getInsensitive()}}`.
- Text hover with no click: tip stays hidden (`selectionStart`, not the pointer; caret was at 521).
- Explain: 8 rows, the range row is the same template. Comp interpolates `A` / `Z` / `65` / `90` and nests the walk under capturing group / character set.

Until that string is English, a regexr.com user has no reason to roll over here.

### pattern-in-GIF — OURS

Proven. Comp needs Sign in to keep a pattern on their server; close the tab and it is gone. Ours wrote `save` `current` and came back. Recents Keep stored the row.

### invite — OURS

Comp cannot do this at all. This build can:

- Host typed `fromHOST_99` / “fromHOST_99 is the live expression”. After Invite remount, host still on that row.
- Guest opened the link onto **`fromHOST_99`**, 1 match, not the default `([A-Z])\w+` sample. Meet: “Hana is on this pattern.” Host: “Cleo is on this pattern.”
- Guest then typed `fromGUEST_7`; host updated. Last-write-wins after adopt.

The listing’s “a friend is on the same expression with you” is true of this build. Solo boot still paints “Waiting for a friend… Invite sends the link. They get this pattern.” before anyone pressed Invite — occupancy of a room that does not exist yet, not a share failure.

### phone — OURS on the tester, COMP on the chrome

390×844: Menu is a real drawer (Cheatsheet / Reference / Recents, ✕ closes). Tools stack under Text. No horizontal overflow. Matches stay readable (`RegExr` / `12` / `345` / `OFFLINE_ok99`). App toolbar wraps three rows under the OS Invite/Save/Help — `#top` is **114px** (desktop 1280 is 45px, one row). Comp’s phone keeps the highlighted sentence as the hero.

### ICON — OURS (on a Home Screen)

64px sticker: `/(\d+)/g`, digits 1–4 lighting on a dark card, 8 frames. Reads as a regex tester at a glance. The loop demonstrates a match, it does not wiggle. Comp has no Home Screen icon to beat.

### Cover — COMP

Listing hero is a 5×7 pixel poster of the default capitalized-word shot — the right moment, and the live window now *does* show those letters. At card size the poster still sells “regex tester”; at hero you can tell it is a drawing (pixel glyphs, `8 MATCHES`, shortened sample). The running window is system-ui, 23 matches, gold wash. Comp’s marketing *is* the live CodeMirror. Retake from the live Text pane.

### Listing copy — OURS

Rendered `/store.html#app=regexr`:

- Tagline: “The pattern and the test text live in this file — works on a plane, one Invite shares it.”
- Leads with no-account / file-is-the-save / Invite. Names regexr.com. Unofficial-port pill. Honest about JS-only, no community catalog, no PHP/PCRE. GPL-3.0, Grant Skinner, GifOS porter, blessed false.
- Invite line is true of this build. Persist and offline were true.

Store search distinguishes the two apps. The cover on the listing paints; it is still a drawing of the app, not a photograph of it.

### Tests — function OURS, typing COMP

Add test → Match any / Hello → PASSED, green border, trash SVG. `paintTests()` rebuilds the row on each `input`; after typing, `activeElement` was `body.tests`. Comp’s Tests keep the caret.

---

Matches and Invite are done. COMP still wins the thing RegExr is *also* for: a token that explains itself. Interpolate the templates, then the file-is-the-save line is enough to leave regexr.com.
