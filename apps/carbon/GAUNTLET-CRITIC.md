# Carbon — gauntlet critic

Bar ONE is [carbon.now.sh](https://carbon.now.sh) (Seti, grey field, Hack, `pluckDeep`). Bar TWO is the platform. Judged on the running GifOS app (desktop + 390×844 phone), the listing page, Home Screen icon, a 2× PNG download, persist across reopen, and two rooms on one Invite link. Comp inspected live.

**Winner: COMP**

**Single biggest remaining gap:** The picture is still not Carbon. The live window and the PNG are `ui-monospace` (Liberation/Menlo on this box), not Hack/Fira. carbon.now.sh’s default is `Hack, monospace` at 14px with a real CodeMirror. A stranger tweets the image; ours looks like a terminal dump of the same snippet. Vendor a code font *inside the GIF* (no CDN) and the window/PNG catch the original. Until then “as good as” is losing, and we are not even there.

**Stranger-reason:** I know carbon.now.sh. I would open this one when I want the snippet and the theme to live in a file I own — close it, come back, still on Dracula and `const persisted = 42` — and when I want a friend on the same image from one Invite, with no account. I would still open carbon.now.sh when the PNG has to look like Carbon.

**Wall breaks:**

- **Catalog (broken).** `site/apps/carbon/{carbon.gif,app.json,cover.jpg}` exist (GIF 152 KB, signed). `site/apps/index.json` has 156 apps and **does not list `carbon`**. Store search for “carbon” paints “Nothing matches that.” Deep-link `#app=carbon` still loads `app.json` and the listing. The grid — the face — is missing. Catalog-regenerate wall.
- **Google fonts / CDN (held).** App iframe: zero requests off origin. Packed GIF contains no `http://`, `https://`, `googleapis`, `gstatic`, `cdnjs`, `jsdelivr`. Fonts are `system-ui` + `ui-monospace`. Comp loads Hack from `cdn.jsdelivr.net/font-hack/…woff2` and hits Google Analytics.
- **gifos.db persist (held).** Typed `const persisted = 42`, switched to Dracula, closed, reopened the same file: both still there. Status: “The snippet lives in this file.”
- **No fetch/eval in the app (held).** Invite is OS chrome (`#appinvite`), not an in-app button.

Not a sandbox wall, but a real HTML bug: two `id="chrome"` (window bar *and* the “Window controls” checkbox). Settings CSS/JS for `#chrome` hit the wrong node; the checkbox reads as an unlabeled 48px flex row.

---

## Pieces

### Icon — OURS (on a Home Screen)

64px sticker: grey field, traffic lights, syntax bars that grow over 8 frames. Reads as a code window at a glance next to Camera / App Store. Animation earns the loop (it types, it does not wiggle). Comp has no Home Screen icon to beat.

### Cover — COMP

Listing hero is the default Seti `pluckDeep` shot on the grey field — the right moment — but it is a 5×7 bitmap, not a photograph of the running window. At listing width the glyphs are readable; at grid-card size they mush. Squoosh and Monkeytype covers read in one look. Comp’s marketing *is* the live Hack window. Ours does not look like the app you get when you tap Install.

### Listing copy — OURS on the page, absent from the grid

Rendered `/store.html#app=carbon`:

- Tagline: “Pretty code images, no account — the snippet lives in this file.”
- Leads with no-account / file-is-the-save / PNG / Invite. Names carbon.now.sh. Unofficial-port pill. Claims that persist and PNG were true of this build.
- Invite line is **soft-overclaim** (see below): a friend *can* type on the same row after they write; they did **not** land on the host’s live snippet.

The copy is the reason. The grid hole means a stranger browsing Developer never sees it.

### Pretty-code window — COMP

Blind, same default snippet:

- Both: grey `rgb(171,184,195)`, Seti `rgb(21,23,24)`, traffic lights, `pluckDeep` / `compose` / `unfold`.
- Comp: one tight toolbar, Hack, the window is the page.
- Ours: toolbar wraps on a 1280 desktop (Export PNG drops to a second row). Short snippets auto-width into a postage stamp on a sea of grey. Highlighting on JS is in the right Seti keys (`const` keyword, names definition/variable, strings cyan, `1`/`0` number) but it is a local tokenizer, not CodeMirror.

29 themes, 31 languages, swatches, settings sheet (padding / size / width / dots / shadow / title) — the chrome is there. The typeface and the toolbar are why the original still wins the glance.

### PNG export — function OURS, picture COMP

Export PNG at 2× downloaded `pluck.js.png` (1160×920). Canvas draw: grey field, shadow, dots, title, line numbers, Seti colours. It is a real PNG from the sandbox, no tab-screenshot. It is still system mono; on-screen italic comments did not survive into the file. Comp’s export is the one people recognise.

### Snippet-in-GIF — OURS

Proven. Comp needs Sign in/up to keep a snippet on their server; you can use it without an account, then you lose the tab.

### Invite co-edit — not a win yet

Comp cannot do this at all. Ours almost can:

- Invite minted a `/run.html#j=…` room. Guest chrome: “shared with the meeting by Hana.” Presence: “Hana is on this snippet” / “Cleo is on this snippet.”
- Host had typed `const fromHost = "hello guest"`. Guest opened onto the **default `pluckDeep` sample**, not that line. Guest then typed `const fromGuest = 7`; host updated. Last-write-wins works after someone types. Join publishes the guest’s empty/default row over the host’s live snippet.

Until a guest *gets this snippet*, the listing’s “carbon.now.sh cannot do that” is a capability we have not finished.

### Phone — COMP

390×844: ours app toolbar is **259px** (theme, language, swatches, then Recents/Open/Sample/Keep, then Copy/PNG/Export). The window scales to ~327px and the default snippet is tiny. No horizontal overflow (good). Settings is a bottom sheet with ✕ (good). Comp’s phone stacks Theme/Language once and keeps the window as the hero.

### No Google fonts CDN — OURS (wall)

Required, and held. The cost is the gap at the top of this file.

---

COMP still wins the thing Carbon is for. The stranger-reason is real and unfinished: file-is-the-save is done; Invite and the picture are not.
