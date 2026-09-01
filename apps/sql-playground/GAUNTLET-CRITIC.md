# Gauntlet critic — SQL Playground

Bar ONE: **DB Browser for SQLite** (sqlitebrowser.org, 3.13) and **sql.js.org/examples/GUI/** (the engine’s own interpreter). Driven 2026-08-30. sql.js.org opened live: CodeMirror SQL editor, Execute / Save DB / Load DB / Examples, empty results until you run, wasm + CodeMirror from the network (cdnjs). DB Browser is the desktop install: Database Structure, Browse Data spreadsheet, Execute SQL, CSV, graphs, SQLCipher. Floor, not ceiling — sql.js.org is a demo that forgets the tab; DB Browser is the real SQLite tool a stranger already has.

Bar TWO: the platform — the database lives in the GIF, Invite shares it live, works offline, no install.

Judged on the packed GIF in the real GifOS sandbox (`?run=sql-playground`, desktop 1280×800 and phone 390×844), the rendered `/store.html#app=sql-playground` listing, icon at 64px on Stolen Apps next to the seeded stickers, cover at card (240) and hero (680) beside Carbon and 2048, sql.js.org in the same Chromium, and a second browser context joined through one Invite link. One Chromium.

## Winner

**OURS**

sql.js.org is a nicer *editor* (line numbers, highlighting, Ctrl+S) and a worse *product*: it fetches wasm and CodeMirror from the network, shows an empty result pane on first paint, and the README’s own sentence is the indictment — a virtual file in memory, changes do not persist. DB Browser still wins the “scan a table like a spreadsheet” job, and it needs an install. This copy actually runs SQL on first boot (Chinook-tiny join, 10 albums by minutes, Cannonball 35.3 sitting on screen), restores `Fresh Eyes` after a full close, and a guest on one Invite link saw `Shared Live` then wrote `Guest Wrote` back. A stranger who knows the originals has a reason (below). Beating sql.js.org by “we remember the tab” would still be a weak win; the Invite-is-the-same-database is the thing neither original has.

## Single biggest remaining gap

**There is no Browse Data.**

DB Browser’s identity is a grid you sort, filter, and edit without writing SQL. Ours is query-and-results: tap a table and you get `SELECT * … LIMIT 200`, then you are back in the SQL box. Cells are not editable. Columns are not sortable from the header. A stranger who opens sqlitebrowser to *look at* a `.sqlite` still has that reason to stay on the desktop app. Not a prettier icon, not more chips, not syntax highlighting — a browse grid (even read-only, even without in-place edit) is the climb.

## Stranger-reason

“sql.js.org forgets when I close the tab, and DB Browser is an install. This one is the file — I closed it, Fresh Eyes was still in artists, I sent Invite, Ben queried the same row I just inserted, and on a 390-wide screen with the network off it still counted 24 tracks.”

Said back without prompting. Verified: reopen status `Database restored.`, `SELECT name FROM artists WHERE name = 'Fresh Eyes'` → 1 row; guest body class `guest`, Sample/New/Open `pointer-events: none`, host `INSERT … 'Shared Live'` then guest `SELECT` returned that name with `artists  9`; guest `INSERT … 'Guest Wrote'` then host `SELECT` returned it with `artists  10`. Phone `setOffline(true)`: `SELECT COUNT(*) FROM tracks` → `24`.

## Wall breaks

- **No CDN / no remote load:** pass. After mount, wasm-like and off-origin request lists were empty (`[]`). sql.js.org pulled `cdnjs.cloudflare.com` CodeMirror css/js and its own origin wasm. CSS here is `system-ui`. Manifest has no `network`.
- **Wasm from the GIF:** pass. Engine instantiates `SQL_WASM_B64` as a `blob:` URL with `wasmBinary`. No `*.wasm` fetch.
- **Save in gifos.db:** pass. `file` collection row `db` survived close and `run.html#id=` reopen (`artists  9`, Fresh Eyes). Prefs history chips came back too.
- **minBuild 947:** listed; honest.
- **Assets inside the GIF:** packed by `build.mjs` (html/css/js + wasm glue + COPYING). 734 KB download on the listing matches `app.json` `bytes` 751808.
- **Listing claims:** every testable sentence was true of this build (file-is-the-save, Invite is OS chrome, sample shop, join on first run, tap a table, Open/Save controls, their demo forgets, signed gifos.app).
- **Catalog index:** **fail to ship.** `site/apps/sql-playground/` has gif + cover + `app.json`, but `site/apps/index.json` does not name the slug. Store search for `sql` rendered “Nothing matches that.” Direct `#app=sql-playground` and `?run=sql-playground` still work. A stranger browsing the grid cannot find it until the catalog is regenerated.

## Pieces (evidence, not the winner)

**Icon.** 12 frames, 100 ms, `SQL` on a dark card, a teal query bar that grows, four table rows that light in. At 64px on Stolen Apps (next to Welcome.gif / Camera.gif / the SYS launchers) it reads as a *table being queried*, not a generic chart. The loop earns it. Comp has no Home Screen icon. Shield is OS (signed). Not a wiggle.

**Cover.** Procedural pixel-font drawing (`icon.mjs` `screenshotPng`), not a frame of the running app. The live UI is system-ui and cleaner — real `Somethin' Else`, eight visible result rows, a New button the poster omits. At hero (680) the join, schema counts, and “PRESS INVITE TO SHARE THIS DATABASE” still sell mid-query. At card (240) it is dark mush: title barely, rows gone; 2048 still looks like a game at that size, Carbon still looks like a snippet. Footer says `10 ROWS` and draws six. Retake from the live player (toolbar cropped) if the card has to compete in the grid.

**Listing.** Tagline leads with the platform reason. Body says the file, Invite, the plane, the music shop, tap-a-table, Open/Save, then “their demo forgets… this one does not.” Read on the rendered listing (desktop and 390). 734 KB, signed, unofficial port credited to sql.js authors, porter GifOS, blessed false. Grid card could not be judged: the slug is missing from `index.json`.

**Actually running SQL.** First boot auto-ran the starter join: Cannonball 35.3 / Coltrane 32.9 / Kind of Blue 24.6, schema `albums 10` … `tracks 24`. Tap `artists` → `SELECT * FROM "artists" LIMIT 200;` → 8 rows · 8 ms. Chip “Sales by country” → USA 10.89 / UK 8.91 / Austria 1.98. `SELECT nope FROM missing` named `no such table: missing` in red. Explain produced `SCAN al` / `SEARCH ar USING INTEGER PRIMARY KEY`. Timing in the status line. This is a working playground, not a screenshot of one.

**Wasm from GIF, not network.** Pass, as above. sql.js.org does the opposite on first paint.

**db-in-GIF.** Pass, as above. sql.js.org’s own README: doesn’t persist. DB Browser persists a file on disk after an install — not a GIF you can hand someone that *is* the app and the data.

**Invite shared db.** Pass, as above. Guest landed on the host’s restored shop (`Database restored.`, not a second sample). Sample/New/Open greyed. Meet line: “Shared database — SQL you run is live for everyone.” Host chrome really does say Invite. Neither sql.js.org nor DB Browser has this.

**Phone (390×844).** Tables button 42×88, every action button 42 px, schema `display: none` until Tables, drawer `Close tables`, tap `tracks` ran `SELECT * FROM "tracks" LIMIT 200` (24 rows) and closed the drawer. Airplane-mode still counted. Usable, cramped: the starter SQL clips at `AS`, the minutes column falls off the result grid, the OS bar plus six action chips plus chips-plus-history eat the first screen. Not the gap.

**sql.js.org GUI, beside ours.** Theirs: highlighted employees demo, empty results, CDN. Ours: schema with counts, sample already joined, no network, a reason to send a link. Editor chrome they win; the product they lose.

**DB Browser, beside ours.** Theirs: Browse Data, structure designer, CSV, plots, encryption, files of any size on disk. Ours: a 734 KB GIF that is the database and the multiplayer room. Different jobs. The job they still own is the gap.
