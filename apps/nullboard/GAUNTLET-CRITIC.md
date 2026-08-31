# Nullboard — fresh-eyes critic

Blind A/B against [nullboard.io/preview](https://nullboard.io/preview) (the original; Trello is the account people already have). Driven in Chromium, desktop 1280×800 and phone 390×844, with a `gifos.db` stub. Icon frames taken from `site/apps/nullboard/nullboard.gif`. Cover judged at grid-card (~240×144) and listing-hero (~640×384) beside 2048 / Excalidraw / FortuneSheet / JS Paint.

**Winner: COMP**

The original opens onto a compact Barlow board. This copy opens onto a blank page with the word “Nullboard” in the corner (and, on a phone, a + Note bar that does nothing). `ReferenceError: NB is not defined` on first boot. There is no board to judge.

## Winner

COMP. The original is a working Nullboard. Ours is a sticker, a fake cover, and a listing for an app that does not mount.

## Single biggest remaining gap

`window.startNullboard` wrapped `var NB` into function scope and only writes `window.NB` at the *end*. Vendor helpers still read the global. First thing init does is `NB.storage.initBackups(onBackupStatusChange)` → `onBackupStatusChange(null)` at `vendor/nullboard.js:2100` (`NB.storage.backups.agents`) → throw. Demo board never created, `NBApp` never assigned, `showBoard` never runs.

`boot.js` then makes it worse: `hydrate().then(boot).catch(boot)` re-enters `boot` after the throw, so the same stack fires twice. Screenshot: empty wrap, logo only.

Until that scope is global again (or every `NB.` in the vendor closes over the local), invite, persistence, phone menus, and the kanban itself are unreachable. Do not polish the cover on a dead board.

## Stranger-reason

You know the original — why would you use this one?

You wouldn't. The original is one HTML file that *is* the board. This GIF is supposed to be the board you can keep and the room you can share. It is a white rectangle. That is not a reason; it is a shrug.

## Icon / cover / listing (the face, judged anyway)

**Icon.** 12 frames, 100 ms, a card sliding Doing → Done, bar going blue → green. At 128 px it reads as three lists and the loop earns itself. At real Home Screen size (~64 px) it is pale grey-on-grey; the moving card is a smudge, and it will vanish next to any seeded icon with colour. Still the strongest of the three faces.

**Cover.** A 5×7 bitmap mock, not a frame of the app. Barlow is the product; this is a different typeface. Notes are the porter's own punch list (`TRIAGE THE GATE REDS`, `PORT NULLBOARD`, `WRITE THE CUT NOTE`) — not a stranger's board, not mid-use. At card size the three columns still parse; at hero it is obviously not Nullboard. 2048's card sells the reason in the art; Excalidraw's card *is* the app. Ours loses both sizes, and loses to the original preview, which *is* the board in Barlow.

**Listing.** Tagline is the right sentence: *The board is the file. One invite is the room — no Trello account.* Description leads with the reason, then how to type. Every functional claim is currently false, because there is no board: close-it-and-come-back, Invite, phone swipe, drag, ≡. An overclaim on a dead build is a failed round, not a style note.

**Commons Clause.** License field is `BSD-2-Clause with Commons Clause` — honest. Copy does **not** say “open source”, does **not** claim you may sell it, and “hand someone the GIF” is free redistribution, which the clause allows. Do-not-sell is only in the license field, not the tagline; that is omission, not overclaim. No flag.

## Kanban / persistence / invite

Not reached. Phone bar paints from CSS (`display:flex` under 700 px) even after the throw; taps no-op (`NBApp` missing). Persistence plumbing (`ls-stub` → `gifos.db('save')`, `afterSave` flush) is wired but never fed a board. Invite (`mp.js`, last-write-wins whole board, 280 ms) never starts. The LWW clobber the builder already named would be the next gap *after* boot.

What the original still has that this copy dropped even on paper: IBM Plex / Open Sans / Maven Pro (extras woffs not vendored; Barlow is inlined). Auto-backup UI is correctly hidden (`display:none !important`); agents default off (`enabled` is `''`).

## Wall breaks

- **Boot is a wall in practice.** The wrap that made `gifos.db` hydrate first also un-globalled `NB`. The GIF loads, then throws. A suite that opened this app would see zero notes.
- **`$.ajax` is still in `vendor/nullboard.js`** (SimpleBackup → `http://127.0.0.1:10001`). Agents are disabled and the Auto-backup row is CSS-hidden, so it does not fire on this boot — but it is a live code path the moment anyone enables an agent, and the app declares no `network` capability. Dormant, not gone.
- **Catalog:** `site/apps/nullboard/{nullboard.gif,cover.jpg,app.json}` exist; `site/apps/index.json` has no `nullboard`. The listing cannot be read on the store page. `app.json.copyright` is Barlow's (`Copyright 2017 The Barlow Project Authors`), not Pankratov's.
- **Not walls:** Barlow as data URLs; jQuery CDN fallback removed; `COPYING.txt` packed; `minBuild` 947; `save` private / `room` read-write; `basedOn.blessed: false`; shell JS has no `fetch`/`eval`. Extra `</div>` after `.config` is upstream. 404 on this drive was `favicon.ico`, not a font.

Fix the global. Then come back for LWW, the cover (a real Barlow frame, not a pixel schematic of the port), and a listing that only sells what the build does.
