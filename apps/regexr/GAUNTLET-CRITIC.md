# RegExr — gauntlet critic

Bar ONE is [regexr.com](https://regexr.com) (Grant Skinner / gskinner.com): live matches in the text, CodeMirror editors, JS **and** PHP/PCRE, Cheatsheet / Reference / Community, Tools, Tests, Sign in. Driven live. Distinct from `apps/regexper` (railroad diagrams; store search for `regexper` finds that one).

Bar TWO is the platform: offline, the pattern lives in the GIF, one Invite shares it, no account.

Judged on the packed GIF in the real sandbox (`run.html#id=`), desktop 1280×800 and phone 390×844, `/store.html#app=regexr`, Home Screen at 64px, persist across reopen, two contexts on one Invite link, and regexr.com in the same Chromium. One Chromium.

**Winner: COMP**

**Single biggest remaining gap:** Matches are painted *over* the text. `#textHl mark.match { color: transparent; background: rgba(255,210,70,.42) }` sits under a `color: transparent` textarea, so every hit is a gold bar and the matched word is gone. Default boot: 23 matches, “RegExr was created by gskinner.com.” reads as a brown slab, then “was created by gskinner.com.” Phone `\d+` on `ab 12 cd 345` is `ab ■ cd ■`. regexr.com’s default `/([A-Z])\w+/g` is 27 pale-blue highlights you can still read — “RegExr”, “Edit”, “Expression”. The tester’s one job is to show the match *in* the text. Until the glyphs stay, COMP wins the thing RegExr is for.

**Stranger-reason:** I know regexr.com. I would open this one on a plane, and because close-and-reopen left me on `persistME_42` / “persistME_42 lives in the file” with no account. I will not, while the hits are redaction bars and a friend who opens Invite lands on the sample, not my expression. That is not a reason to leave regexr.com. Paint the matched letters, land the guest on this pattern, then the file-is-the-save line is enough.

**Wall breaks:**

- **Catalog (broken).** `site/apps/regexr/{regexr.gif,app.json,cover.jpg}` exist (185 KB, signed). `site/apps/index.json` has 156 apps and does **not** list `regexr`. Store search for “regexr” paints “Nothing matches that.” Search for “regexper” finds the railroad app. Deep-link `#app=regexr` still loads `app.json` and the listing. The grid a stranger browses does not. Catalog-regenerate wall.
- **GPL-3.0 (held).** Packed GIF contains `COPYING.txt` (GNU GPL v3). Listing fact is GPL-3.0. Vendor IIFEs carry the gskinner.com 2017 copyright and “Converted from ESM… Pinned commit d18630d.” `listing.basedOn.blessed` is false; unofficial-port pill is on the page. Help does not mention the GPL; the original chrome does not either. Corresponding source *is* the JS in the GIF. `vendor/COPYING.txt` is in the tree and not packed — duplicate of the root file, not a missing license.
- **No CDN (held).** App iframe: zero requests off `127.0.0.1:8099`. Packed HTML has no `http://`. Fonts are `system-ui` + `ui-monospace`. Manifest has no `network`. Comp loads `fonts.googleapis.com` / `fonts.gstatic.com` (Roboto Condensed, Source Code Pro), `google-analytics.com`, `cdn.carbonads.com`, `ad.doubleclick.net`, Cloudflare insights.
- **gifos.db persist (held).** Typed `persistME_42` against “persistME_42 lives in the file”, closed the tab, reopened the same `fileId`: pattern, text, flags `gi`, 1 match. Status: “The pattern lives in this file.”
- **Invite is OS chrome (held).** No in-app Invite button. `#appinvite` minted `/run.html#s=regexr.…`. Guest chrome: “shared with the meeting by Hana.”

Listing line “a friend is on the same expression with you” is an **overclaim of this build**, not a sandbox break — see Invite below.

---

## Pieces

### tester+matches — COMP

Blind, same default `/([A-Z])\w+/g`:

- Comp: 27 matches, letters still there, blue wash, CodeMirror, flavor chip JavaScript / Flags, Explain interpolates `A-Z Range. Matches a character in the range "A" to "Z" (char code 65 to 90).`
- Ours: 23 matches on a shortened sample (Invite / Recents / “this copy runs JavaScript”), gold slabs, expression overlay *is* coloured (`(` green, `\w` cyan, `+` orange). Count and ms work (`5 matches  0.5ms` on “Hello World from GifOS and Regexr.com Test”).

Replace `$1` → `H W from G and R.com T`. List printed the five words, one per line. Clicking a match opened Details (`match 1 Hello / group 1 H`) and a tooltip. Expression hover dumped leftover templates: `Matches a character in the range {{getChar(prev)}} to {{getChar(next)}}…`. Text hover with no click did nothing (`selectionStart`, not the pointer). Tests: Add test → Match any / Hello → PASSED; `paintTests()` rebuilds the row on each `input`, focus left the textarea (`activeElement` was `body.tests`). Cheatsheet click appended `.`. Flag `i` lit. JS-only is honest.

None of that is the gap. The Text pane is.

### pattern-in-GIF — OURS

Proven. Comp needs Sign in to keep a pattern on their server; close the tab and it is gone. Ours wrote `save` `current` and came back. Recents Keep stored `/kept_pattern_xyz\d+/gi`. Launch keys exist in the manifest (untested this pass).

### invite — not a win yet

Comp cannot do this at all. Ours almost can, and then it lies:

- Solo meet line is already “Waiting for a friend… Invite sends the link. They get this pattern.” `watch()` sets `on = true` as soon as `gifos.db('room')` exists, Invite or not.
- Host typed `fromHOST_99`. Guest opened the link onto the **default** `([A-Z])\w+` sample (23 matches). Meet: “Hana is on this pattern.” Presence is occupancy, not the expression.
- Host after the join was back on the sample too; meet: “Cleo is on this pattern.” Join `publish()`s the guest’s boot row over the host’s live one. Last-write-wins, first write is the sample.

Until a guest *gets this pattern*, the listing’s “regexr.com cannot do that” is a capability we have not finished.

### phone — COMP on the tester, OURS on the shell

390×844: Menu is a real drawer (Cheatsheet / Reference / Recents, ✕ closes, `onBack` wired). Tools stack under Text. No horizontal overflow. Offline (`setOffline(true)`) still matched `\d+` → 2 hits. App toolbar wraps three rows (flags, Keep/Sample, Copy result/Menu) under the OS Invite/Save/Help — `#top` is 114px. The gold bars are worse in a 348px text pane: you cannot read the sample at all. Comp’s phone keeps the highlighted sentence as the hero.

### ICON — OURS (on a Home Screen)

64px sticker next to Camera / Welcome: `/(\d+)/g`, digits 1–4 lighting on a dark card. Reads as a regex tester at a glance. The loop demonstrates a match, it does not wiggle. Comp has no Home Screen icon to beat.

### Cover — COMP, and a lie about ours

Listing hero is a 5×7 pixel poster of the default capitalized-word shot — the right moment — with **readable** yellow matches (`REGEXR`, `EDIT`, `ROLL`…) and `8 MATCHES`. The running window is system-ui and redacts those words. At card size the poster still sells “regex tester”; at hero you can tell it is a drawing, and it is a drawing of an app you do not get. Comp’s marketing *is* the live CodeMirror. Retake from the live Text pane once the glyphs show.

### Listing copy — OURS on the page, absent from the grid

Rendered `/store.html#app=regexr`:

- Tagline: “The pattern and the test text live in this file — works on a plane, one Invite shares it.”
- Leads with no-account / file-is-the-save / Invite. Names regexr.com. Unofficial-port pill. Honest about JS-only, no community catalog, no PHP/PCRE. GPL-3.0, Grant Skinner, GifOS porter, blessed false.
- Invite line is the overclaim above. Persist and offline were true of this build.

The copy is the reason. The grid hole means a stranger browsing Developer never sees it.

---

COMP still wins the thing RegExr is for. The stranger-reason is real and unfinished: file-is-the-save is done; the matches and the Invite are not.
