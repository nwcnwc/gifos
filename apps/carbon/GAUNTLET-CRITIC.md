# Carbon — gauntlet critic

Bar ONE is [carbon.now.sh](https://carbon.now.sh) (Seti, grey field, Hack, `pluckDeep`). Bar TWO is the platform. Judged on the packed GIF (`site/apps/carbon/carbon.gif`, 281 KB, signed) in the real sandbox (`run.html#id=`), desktop 1280×800 and phone 390×844, `/store.html#app=carbon`, store search, a 2× PNG from `CarbonExport`, persist across reopen, two contexts on one Invite link, and carbon.now.sh in the same Chromium.

**Winner: OURS**

**Single biggest remaining gap:** The phone is still not Carbon. On 390×844 the app toolbar is **259px** (Theme/Language, swatches + Settings, Recents/Open/Sample/Keep, Copy/PNG/Export) and the window scales to a thin card of tiny Hack. carbon.now.sh stacks Theme/Language once and keeps the window as the hero — that is the thing you came to make. Collapse Recents/Open/Keep/Copy/Sample into the Settings sheet so one row of Theme / Language / Export is the chrome, and the picture is the page. Until then a stranger with a phone still opens the original.

**Stranger-reason:** I know carbon.now.sh. I would open this one: no account, close it and come back still on Dracula and `const persisted = 42`, export a PNG that is Hack at 14px (slashed zero, italic comments), and press Invite so a friend lands on *this* snippet. I would still open carbon.now.sh on a phone, and when I want CodeMirror’s 70 modes rather than a local tokenizer.

**Wall breaks:**

- **Catalog (held).** `site/apps/index.json` has 201 apps and **lists `carbon`**. Store search for “carbon” paints the Carbon card (281 KB, Developer / Creativity, “Works offline”). Deep-link `#app=carbon` loads the listing. Signed by gifos.app.
- **Google fonts / CDN (held).** Packed GIF: no `http://`, `https://`, `googleapis`, `gstatic`, `cdnjs`, `jsdelivr`, `font-hack`. Hack Regular + Italic are `data:font/woff2` in `style.css` (and the `.woff2` files themselves). `COPYING-hack.txt` is in the GIF. Comp loads Hack 2.020 from `cdn.jsdelivr.net/font-hack/…woff2` and hits Google Analytics + DoubleClick.
- **gifos.db persist (held).** Typed `const persisted = 42` / `// italic comment lives here`, switched to Dracula, closed, reopened the same file: both still there, family still `Hack, monospace`, `document.fonts.check('14px Hack')` true. Status: “The snippet lives in this file.”
- **No fetch/eval in the app (held).** Invite is OS chrome (`#appinvite`), not an in-app button.
- **Guest join does not overwrite (held).** Host typed `const fromHost = "hello guest"`. Guest opened the `/run.html#j=…` link onto **that line**, not the sample. Meet: “Hana is on this snippet.” Guest typed `const fromGuest = 7`; host updated. Last-write-wins after join, first write is the host’s live row.

Duplicate `id="chrome"` from the last pass is gone (checkbox is `winChrome`). Solo meet line still lies: `watch()` sets `on = true` as soon as `gifos.db('room')` exists, so a file you have not Invited already says “Waiting for a friend… Invite sends the link. They get this snippet.”

---

## Pieces

### Pretty-code window — OURS on the typeface, COMP on the chrome

Blind, same default snippet, live packed GIF:

- Both: grey `rgb(171,184,195)`, Seti `rgb(21,23,24)`, traffic lights, `pluckDeep` / `compose` / `unfold`.
- Comp: one tight toolbar, `Hack, monospace` 14px, `document.fonts.check('14px Hack')` true, M-width **8.429**. CodeMirror. The window is the page. Sign in/up, Tweet, ads.
- Ours: family **`Hack, monospace` 14px**. Faces loaded: Hack regular + italic. `check('14px Hack')` true, italic true. M-width **8.429** (Liberation Mono 8.401, Menlo / `ui-monospace` 12.448). Slashed zero in the window and in a 28px canvas glyph. Toolbar wraps on a 1280 desktop (`#bar` 132px — Export PNG drops to a second row). Highlighting is the local tokenizer on Carbon’s Seti keys (`const` keyword, `pluckDeep` definition, strings cyan, `1`/`0` number, `.split`/`.reduce` property purple). Comp paints those methods the same cyan as the names — a nerd sees it; a tweet does not.

29 themes, 31 languages, swatches, settings sheet — the chrome is there. The typeface is no longer why the original won the glance. The wrapping toolbar still is, on a small screen.

### PNG export — OURS

Export at 2× from the sandbox (`CarbonExport(2)`): default snippet **2042×1110**, grey field, shadow, dots, Seti, **Hack** (slashed zero, not Liberation/Menlo). Dracula + `// italic comment lives here` drew italic Hack into the file (`commentStyle: italic`, `check('italic 14px Hack')` true) — the last pass’s italic-did-not-survive is gone. Real PNG, no tab-screenshot. Comp’s export is no longer the one a stranger would pick at a glance.

### Snippet-in-GIF — OURS

Proven again. Comp needs Sign in/up to keep a snippet on their server; you can use it without an account, then you lose the tab.

### Invite co-edit — OURS

Comp cannot do this at all. This pass:

- Invite minted ` /run.html#j=…&relay=ws://127.0.0.1:8790`. Guest chrome: “shared with the meeting by Hana.”
- Guest opened onto `const fromHost = "hello guest"`, family Hack. Presence: “Hana is on this snippet.”
- Guest typed `const fromGuest = 7`; host: that line, “Cleo is on this snippet.”

The listing’s “carbon.now.sh cannot do that” is true of this build.

### Phone — COMP

390×844: toolbar **259px**, window width 782 scaled onto a 390 stage, no horizontal overflow (good). Settings is a bottom sheet with ✕ (good). The default snippet is a readable-but-tiny card under four rows of buttons. Comp’s phone keeps the window as the hero. This is the remaining gap.

### ICON — OURS (on a Home Screen)

64px sticker: grey field, traffic lights, syntax bars. Reads as a code window at a glance. Comp has no Home Screen icon to beat.

### Cover — COMP

Listing hero / grid card is still the 5×7 bitmap of `pluckDeep` on the grey field — the right moment, the wrong picture. At listing width the glyphs are readable; at card size they mush. The running window is now Hack. The store still sells a drawing of an app you do not get. Comp’s marketing *is* the live Hack window. Retake from the live window.

### Listing copy — OURS

Rendered `/store.html#app=carbon`:

- Tagline: “Pretty code images, no account — the snippet lives in this file.”
- Leads with no-account / file-is-the-save / PNG / Invite. Names carbon.now.sh. Unofficial-port pill. MIT + Source Foundry + Bitstream Vera on the page. Persist, PNG-in-Hack, and Invite were true of this build.

Search finds it. The cover is why the card does not look like Carbon.

---

The last critic lost on Liberation/Menlo. That bar is green: window and PNG are Hack, packed inside the GIF, no CDN. File-is-the-save and Invite land. COMP still owns the phone chrome and the store art. Fold the toolbar, retake the cover from the live window, and there is no remaining reason to open carbon.now.sh for the default image.
