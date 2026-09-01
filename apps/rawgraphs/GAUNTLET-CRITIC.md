# RAWGraphs — gauntlet critic

Bar ONE is [app.rawgraphs.io](https://app.rawgraphs.io/) (RAWGraphs 2.0 by DensityDesign Lab, Calibro, INMAGIK): paste a table, pick from ~30 visual models with thumbnail cards, **drag columns onto visual variables**, tune options, export SVG/PNG/.rawgraphs. Distinct from `json-crack` (JSON → node cards, not a table) and `fortune-sheet` (Excel grid + formulas, no grammar-of-graphics). Comp inspected at rawgraphs.io (marketing: “almost 30 visual models”, data stays in the browser) and from the live 2.0 loop (load → choose a chart → drag-map → customise → export).

Bar TWO is the platform: the dataset lives in the GIF (`gifos.db`); works offline; one Invite shares the same table and mapping.

Judged on the packed `site/apps/rawgraphs/rawgraphs.gif` (214 751 bytes, signed) in the real sandbox (`run.html#id=`, desktop 1280 and phone 390×844), unpacked `apps/rawgraphs/` for every model, `/store.html#app=rawgraphs`, Home Screen icon frames, persist across reopen, and the mapping/Invite code. One Chromium (headless_shell). Comp’s live SPA did not paint in this pass; the original’s loop, drag-mapping, catalogue and exports are the named floor.

**Winner: COMP**

**Single biggest remaining gap:** This is not RAWGraphs. It is a working 12-chart sketch of the load → map → draw loop, and the pictures give it away. First boot is an alluvial of prize films with **Size empty** (row counts: USA is a purple slab because 20 of 32 rows are USA, not because of box office). Mapping is native `<select>`s, not the green drag-chips the original is for. There is no visual-options panel. Circle packing **overlaps** (Disney / Warner / Paramount stacked on one another; labels clip to `io ho`). Streamgraph is a jagged stacked polygon, not a stream. Cover is a 4-ribbon pixel cartoon (`USA/UK/JPN` → `DRAMA/ACTION/ANIM/SCI-FI`, `SIZE COUNT`) of an app you do not get: the live window is system-ui on dark chrome with fifteen studio nodes. Until a stranger looks at the paper and says “that’s RAWGraphs,” bar two is a file around the wrong picture.

**Stranger-reason:** I know app.rawgraphs.io. I would open this one on a plane, because close-and-reopen left me on Treemap / Size=`box` / 33 pasted rows with no account, and because Invite exists in OS chrome. I will not, while the packing collides, the alluvial is a count, mapping is a dropdown, and a friend who opens the link does not even join the room until they find **Play together**. That is not a reason to leave the website.

**Wall breaks:**

- **Catalog (broken).** `site/apps/rawgraphs/{rawgraphs.gif,app.json,cover.jpg}` exist (GIF 210 KB, signed by gifos.app). `site/apps/index.json` has 156 apps and **does not list `rawgraphs`**. Store search for “rawgraphs” paints “Nothing matches that.” `json-crack` and `fortune-sheet` both hit. Deep-link `#app=rawgraphs` still loads `app.json` and the listing. The grid a stranger browses does not. Catalog-regenerate wall.
- **Apache-2.0 (held).** Packed GIF contains `COPYING.txt` (DensityDesign Lab, Calibro, INMAGIK, Apache-2.0) and `UPSTREAM.txt`. Listing license matches. `basedOn.blessed` is false; unofficial-port pill is on the page.
- **No CDN / no eval (held).** Packed app JS has no `fetch(`, `eval(`, `new Function(`, `localStorage`. App iframe requests stayed on origin. No in-app Invite button. Fonts are `system-ui`. Comp is a website (Webflow marketing + the React app).
- **gifos.db persist (held, with a footgun).** Close on Treemap + Size=`box` + hierarchy `studio, genre`, reopen the same `fileId`: still Treemap, still `box`. Extra CSV row (`PersistMe_42`) came back as “33 rows · pasted table.” **Any paste remaps:** `applyTable(..., false)` throws the Size you just set. Status after a paste is a new auto-map, not the mapping you had.
- **Invite is OS chrome (held).** `#appinvite` is on the sandbox bar. **Play together does not auto-enter** on an Invite URL — unlike `json-crack`’s `start()` at boot. Guest who follows the link lands solo on the sample until they press the orange in-app button. Listing line “when anyone remaps a field, everyone sees the new picture” is an overclaim of this build.

Not a sandbox wall: 209 KB is a **real GIF**, not a stub. Decode lists 12 files + `credits.json`; `charts.js` is 43 KB; all twelve models return SVG (alluvial 74 paths on the prize-films sample). It is a handwritten port because lodash/d3 UMD call `Function()` at load. Honest about that in `UPSTREAM.txt`. Honest is not the same as winning.

---

## Pieces

### The loop (load → map → draw) — COMP

Blind, same job: a table of films, an alluvial.

- Comp: wizard, thumbnail gallery of ~30 models, **drag** origin/studio/genre onto Steps, drop box office on Size, visual options, SVG+PNG+project export. Alluvial ribbons are a sankey layout.
- Ours: four dark columns (preview of 6/32 rows, a **text** list of 12 types, `<select>` mapping, paper SVG). Boot: “32 rows · 7 columns · prize films sample”, Alluvial on, Steps = origin / studio / genre, Size = `—`. The SVG is a real alluvial (USA/UK/Japan/… → Warner/Disney/A24/… → Drama/Animation/…). Ribbons cross. Studio labels sit on the nodes. Size-by-count is the default `sampleMapping`. Copy SVG exists; PNG and `.rawgraphs` do not. Excel is a plain refusal (`budget.xlsx` → “An Excel workbook will not read”).

Twelve models all draw. Bar, stacked bar, pie, beeswarm, sunburst are the ones that look like charts. Circle packing is broken. Streamgraph is a chevron. Line has no legend. Bubble labels collide (`Get Out`/`Parasite`). Treemap paints leaf names only — Disney’s giant Animation rectangle does not say Disney.

### table-in-GIF — OURS

Proven. Comp is a tab: close it, the mapping is gone unless you exported a project. Ours wrote `save` `last` and came back on Treemap / `box`. That is the reason on the card, and it is true of this build.

### Invite shares mapping — not a win yet

Comp cannot do this. Ours almost can, and then it hides it behind **Play together**:

- `mp.js` `enter()` only runs from `#shareBtn`. json-crack subscribes to `room` at boot. A guest on `/run.html#j=…` is still on the baked sample until they tap the orange button.
- Adopt is last-write-wins on `{csv, chartId, mapping}` by `round` then peer id. Solo “Waiting for a friend… They get this table and this mapping.” is occupancy copy, not a joined guest.
- Until a guest *gets this mapping without a second ritual*, the listing’s “rawgraphs.io cannot do that” is a capability we have not finished.

### Phone — COMP on the product, OURS on the shell

390×844: Data / Type / Map / Chart tabs swap; Back is wired; no horizontal overflow. Type is a 2-up wrap of 12 text cards (no thumbnails). Chart tab is Play together / Choose a CSV / Sample / Copy SVG / status / four tabs, then a cream card with a small alluvial and a blank lower half (`preserveAspectRatio: meet`). Comp’s phone still has the picture as the hero. Ours has the toolbar.

### Icon — OURS (on a Home Screen)

12 frames, 100 ms: a dark rounded card, a spreadsheet grid filling in, then alluvial nodes and ribbons, orange underline growing. At 64px frame 0 reads as a coloured table; frame 11 reads as flows. The loop demonstrates (grid → chart), it does not wiggle. Distinct from json-crack’s JSON cards and fortune-sheet’s grid. Comp has no Home Screen icon to beat. Structural win that does not earn the slot next to Camera while the live window is a different product than the sticker.

### Cover — COMP, and a lie about ours

Listing hero is a 1200×720 pixel poster: `RAWGRAPHS` / `TABLE - CHART`, SAMPLE / COPY SVG, five chips (ALLUVIAL TREEMAP BAR BUMP PACK), ORIGIN/STUDIO/GENRE pills, **SIZE COUNT**, four cartoon ribbons. Mid-use, not empty boot, no GifOS shell. It is not a photograph of the running window (system-ui, twelve text cards, a dense 7-origin alluvial). At grid-card size it still sells “alluvial.” At listing hero you can tell it is a drawing of an app you do not get. Comp’s marketing *is* the live 2.0 window. Retake from the live `#view` once Size is a number and the packing does not collide.

### Listing copy — OURS on the page, absent from the grid

Rendered `/store.html#app=rawgraphs`:

- Tagline: “Paste a CSV, map columns onto a chart — the dataset lives in the GIF.”
- Leads with no-upload / file-is-the-save / unusual charts / Copy SVG / Play together then Invite. Names RAWGraphs. Unofficial-port pill. Honest about Excel. 210 KB, signed, Apache-2.0, DensityDesign / Calibro / INMAGIK, GifOS porter, blessed false.
- Persist was true of this build. Invite is the overclaim above. “A working set of visual models” is true as a count (12) and false as a resemblance.

The copy is the reason. The grid hole means a stranger browsing Productivity never sees it.

### Distinct from json-crack and fortune-sheet — held

json-crack is paste-JSON-see-cards. Fortune-sheet is a workbook. This GIF is a table mapped onto Steps / Size / Hierarchy. Three different products. Search will not find this one until the catalog lists it.

---

COMP still wins the thing RAWGraphs is for. The 209 KB GIF is a real port, not a stub — and “as good as” that original is already losing. The stranger-reason is real and unfinished: file-is-the-save is done; the pictures and the Invite are not.
