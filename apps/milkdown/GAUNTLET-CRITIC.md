# Milkdown — gauntlet critic

Bar ONE is [Typora](https://typora.io) (install, disk file, “removes the preview window, mode switcher, syntax symbols”) and the live [milkdown.dev Crepe playground](https://milkdown.dev/playground?preset=crepe) (v7.22.1 — same kit pin, plus Crepe). Driven live. Distinct from `apps/mermaid` (Recipe / Picture for diagrams; store search for `mermaid` finds that one).

Bar TWO is the platform: the note lives in the GIF, Invite is the same page, it works offline.

Judged on the packed GIF `site/apps/milkdown/milkdown.gif` in the real GifOS sandbox (`run.html#id=`), desktop 1280×800 and phone 390×844, `/store.html#app=milkdown`, Home Screen icon frames, persist across reopen, airplane-mode typing, and milkdown.dev in the same Chromium. One Chromium. Invite minted a room link on the same page; a second context did not survive this box long enough to finish the guest landing.

**Winner: COMP**

**Single biggest remaining gap:** The document is not the window. Typora’s product is a page you write. Crepe’s playground *is* that page on the left (polar bear, blockquote, inline code) with a real source column on the right. Ours is a form that contains a note: title, slogan, Write/Source, fourteen toolbar buttons, Sample/Copy/New/Open, a word-count, and a meet line that already says a friend is coming. On 390 that stack leaves a postcard of the packing list — table cut off at “Who has what:”. `# ` still becomes a heading. Until Write is the whole glass, a Typora user has no reason to switch.

**Stranger-reason:** I know Typora / milkdown.dev. I would open this one because close-and-reopen left me on `PERSIST_TOKEN_MILK_…` / “6 words · saved on this device” with no account, and because it typed `OFFLINE_OK` with the network down. I will not, while the note is a strip under a HUD, the store search for “milkdown” paints “Nothing matches that,” and the live window already says “Waiting for a friend” before anyone pressed Invite. That is not a reason to leave Typora.

**Wall breaks:**

- **Catalog (broken).** `site/apps/milkdown/{milkdown.gif,app.json,cover.jpg}` exist (GIF 342 KB, signed by gifos.app). `site/apps/index.json` has 156 apps and does **not** list `milkdown`. Store search for “milkdown” paints “Nothing matches that.” Search for “mermaid” finds the diagram app. Search for “markdown” is that same mermaid card. Deep-link `#app=milkdown` still loads `app.json` and the listing. The grid a stranger browses does not. Catalog-regenerate wall. `build.mjs` prints that it will not run `build-app-catalog.mjs`.
- **No CDN (held).** App iframe after boot: zero requests off `127.0.0.1:8099`. Fonts are `system-ui` / `ui-monospace`. Manifest has no `network`. Comp playground loaded `unpkg.com`, `fonts.googleapis.com`, `fonts.gstatic.com`.
- **gifos.db persist (held).** Typed `# Persist note` + `PERSIST_TOKEN_MILK_1788218163725`, closed the tab, reopened the same `fileId`: heading, token, “6 words · saved on this device”. First boot had already written `save` `doc` (sample packing note). Close it, come back — true of this build.
- **Offline (held).** Phone `setOffline(true)` still accepted `OFFLINE_OK` into the Bring list.
- **Invite is OS chrome (held).** No in-app Invite button. `#appinvite` minted `/run.html#j=…` on the same persist note. Share sheet: “Anyone with this link joins you live inside this app.”
- **minBuild 947 / MIT / unofficial `blessed:false` / COPYING packed.** Honest on paper. Listing license fact is MIT, Mirone, GifOS porter.

Listing line “a friend types on that same page” is an **overclaim of occupancy on this build**, not a sandbox break — see Invite below.

---

## Pieces

### WYSIWYG — COMP

Blind, first paint vs Crepe playground vs Typora’s claim:

- **Ours, desktop:** sample packing note is a real page — H1, bold, GFM tasks (Tickets checked, strikethrough), quote, 2×2 table, a fence `meet at the north kiosk`. `# Heading from hash space` typed with a space became an H1. `**bold**` became bold. `- ` became bullets. `- [ ]` became a tickable task. `>` became a quote. Status: “93 words · saved on this device.”
- **Crepe:** left pane is the page (emoji, blockquote, captioned polar-bear image, pink `npm install @milkdown/crepe`); right pane is syntax-colored markdown; CodeMirror fences (`cm-editor` × 2); a slash surface exists (`slash: true`). Same kit version, 7.22.1. This is the product a Milkdown user thinks Milkdown is.
- **Typora:** no mode switcher, no preview column, the window *is* the page. Ours ships Write | Source as the first chrome Typora exists to remove.

Ours is the kit, not Crepe. Typed `$e = mc^2$` stayed literal (katex: 0). `/` opened nothing (`slashVis: []`). Three backticks left a fence with leftover `` ``` `` inside and Source showed wrapping `` ```` ``. Toolbar **table** while the caret was in that fence inserted nothing (`tables: 0`). Sample table *does* paint, so GFM tables are in the build — the HUD button is not the Crepe table block.

A Milkdown user will prefer the playground’s page. A Typora user will prefer a window that is the note.

### note-in-GIF — OURS

Proven. Comp playground is a site; close the tab and the welcome is gone. Typora keeps a file on a disk. Ours wrote `save` `doc` and came back. The listing’s close-and-reopen sentence is true of this build.

### Invite — not a win yet

Comp cannot do this at all. Ours almost can, and then it lies:

- Solo meet line is already “Waiting for a friend… Invite sends the link. They get this document.” `watch()` sets `on = true` as soon as `gifos.db('room')` exists, Invite or not. Desktop boot, phone boot, persist reopen: same sentence. The listing says press Invite. The window pretends you already did.
- Invite itself is real OS chrome: same page, `#j=` link, persist note still under the share modal.
- Guest landing on `HOST_TOKEN_99` was **not finished this pass** (the second context died on this box). The code path is last-write-wins on one `live` row; `watch()` `publish()`es the guest’s boot markdown immediately; first boot without a private save is SAMPLE. Until a guest *gets this document*, “Invite is the same page” is a capability we have not shown.

### Phone — COMP on the page, OURS on airplane

390×844, no horizontal overflow (`390×812` client = scroll). Write/Source are 176×42. Toolbar wraps to 89px / 14 buttons and stays that tall in Source, only dimmed (`pointer-events: none`). OS bar is Invite / Save / Help / fullscreen — no Back chevron (`#appback` was null). Help’s “Back leaves Source” did not run. The packing list is heading + intro + Bring + quote; the table is a rule at the bottom of the paper. Airplane mode still typed. Typora on a phone is not a thing; Crepe on a phone is still more of the page. Ours is chrome-first.

### ICON — OURS (on a sticker, sparse at 64px)

8 frames, 128², 120 ms. `#` → `# HI` → `HI` as a heading → `**GO**` → `GO` → `- MAPS`. The loop is the app: marks become a page. It does not wiggle. At Home Screen size the dark card is mostly empty — frame 0 is a hash and a caret — but it still reads as a markdown note, not a mermaid flowchart. Comp has no Home Screen icon to beat.

### Cover — COMP, and a small lie about ours

`cover.jpg` is a 5×7 pixel poster of the packing note, Write selected, table + list + quote. Right *moment*. Not a frame of the running window (system-ui, real checkboxes, real table). Listing hero 678×407: readable as “markdown note.” Grid-card crop would mush the glyphs. Honesty nick: the poster table has a third row **BOTH / TICKETS** that the live sample does not (`You / Snacks`, `Them / Maps` only). Comp’s marketing *is* the live Crepe page. Retake from the live paper once the chrome is out of the way.

### Listing copy — OURS on the page, absent from the grid

Rendered `/store.html#app=milkdown`:

- Tagline: “WYSIWYG markdown that lives in this file — Invite is the same document.”
- Leads with Typora/Obsidian vs file-is-the-save / Invite / no account. Then `# ` / toolbar / Source. Unofficial-port pill. Mirone, GifOS porter, MIT, build 947, Saves-in-the-icon + Multiplayer.
- Persist and offline were true of this build. Invite occupancy is the overclaim above.

The copy is the reason. The grid hole means a stranger browsing Productivity never sees it — they see Mermaid instead.

### Distinct from mermaid

Mermaid is a left-text / right-picture diagram engine: Recipe and Picture, flowchart/sequence/class, Copy SVG. First boot is not a packing list. Milkdown is a WYSIWYG *note*. They do not share a window. They *do* share a store search for “markdown,” and only mermaid is in `index.json`, so the catalog currently sells the diagram as the markdown app.

---

COMP still wins the thing Typora / Crepe is for. The stranger-reason is real and unfinished: the file is the save; the page is not the window; Invite talks like a friend is already here. Put the chrome away, land the guest on this document, put the slug in the catalog — then the plane-and-a-GIF line is enough.
