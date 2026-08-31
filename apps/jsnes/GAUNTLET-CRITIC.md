# jsnes gauntlet critic

Blind A/B against **https://jsnes.org** (Ben Firshman's JSNES site — the original this tree vendors) and **FCEUX 2.6.6** (fceux.com: the NES a stranger would actually install). Played the packed GIF (`site/apps/jsnes/jsnes.gif`, 313 751 bytes, sha256 `121f4917…`) in the real GifOS sandbox (`run.html#id=`, desktop 1100×820 and phone 390×844). Listing read on `/store.html#app=jsnes`. One Chromium. Invite was not two-tabbed — the OS Invite button is there; a second pad was not driven.

**Winner: COMP**

A stranger who knows jsnes.org does not yet have a reason they can say back after using this copy on the screen the listing sells (a phone). Desktop play is a working JSNES with two honest homebrew carts. That is not enough.

## Stranger-reason

Asked: you know the original — why would you use this one?

The listing's answer is "the cartridge and the battery save live in the GIF" and "Invite is player two." After a cold run:

- The two carts **are** in the file. First boot opens Games with Concentration Room (Damian Yerrick · two players) and Lawn Mower (Shiru). Both load. Canvas paints: Concentration Room title and story ("Once upon a time in the"), Lawn Mower in-play (`LAWN01 FUEL … DONE000%`). Nothing Nintendo is in the GIF, the ROMs, or the running UI.
- Close and reopen: last cart comes back (`prefs.last = croom` → Concentration Room title). A dropped `.nes` (`my-homebrew`, 24 KB) stays under Your dumps. That half of the file-is-the-cart claim is true of this build.
- Battery SRAM never wrote a row (`gifos.db('saves')` empty after play). Both bundled iNES headers have flags6 = 1 — mirroring only, no battery bit. Quick-state Save wrote a 1.2 MB JSON slot; Load after Reset still showed the title, not the story frame that was on screen when Save was pressed. "The save lives in this file" is a mechanism the bundled games do not exercise, and the quick-state round-trip was not shown.
- Invite is OS chrome (`#appinvite` display flex, label Invite). A second tab was not joined in this run. Player-two over the room is therefore not a reason this critic can repeat.
- jsnes.org is not "a tab that forgets." Current jsnes.org keeps dropped dumps in `localStorage` (`savedRomInfo` + `blob-<hash>`) and re-fetches its samples from `cdn.jsdelivr.net/gh/bfirsh/jsnes-roms@master/` every visit (croom, lj65, nomolos, owlia, AccuracyCoin). The original forgets the *network* cart, not a dump you dropped. The listing's punch at jsnes.org is softer than it is written.

What a stranger *can* say, unprompted, after the desktop run: "two homebrew games, 306 KB, no jsDelivr, last game is still in there." That is a reason to prefer a file over a website. It is not yet a reason to prefer this over FCEUX, and it is not the tagline.

## Single biggest remaining gap

**On a 390-wide phone the NES is a 256×240 postage stamp, Mute is clipped off the app bar, and Start sits under B.**

The listing's phone sentence is "the pad is under your thumbs — d-pad, A, B, Start, Select." The pad is drawn. Start is not hittable.

- Integer `fit()`: `floor(min(390/256, (844−bar−pad)/240))` = 1. The picture is 256×240 in a 390×844 hole, black above and beside it.
- `#bar` overflow: `btn-mute` `right > innerWidth`. The row is Games, 1, Save, Load, Pause, Reset, **Mu**.
- Face buttons: B then A, NES order, correctly red. Select/Start are in the gutter. On 390, B's circle covers **STA** — the Start label is the letters STA, cut off, under the B disc. Lawn Mower's title is `PRESS START`. Tapping B is not Start. The game that the cover is a picture of cannot be started with the pad the listing describes.

Until Start is a thumb target and the picture uses the width of the phone, the platform reason this copy exists on a device jsnes.org never designed for is a screenshot of a pad, not a playable NES.

## Piece judgements

### Icon — OURS

12 frames, 128², grey NES pad sticker: d-pad arms light in turn (cream), then A. At Home Screen size (~96px) next to Camera / App Store / Meeting it still reads as a NES pad, not a decoration. The loop earns its keep: it is the control the app is for. Comp is a website with no icon. Tiny Select/Start dashes die at 48px; they do not kill the read.

### Cover — COMP (honest picture, dishonest caption)

`cover.jpg` is 1200×720, a real Lawn Mower frame (`LAWN01 … DONE004%`, mower on a cut path) plus a pad and the lines `P1 YOU` / `P2 FRIEND` / `LAWN MOWER` / `DROP A ROM`. No shell toolbar. Mid-use, not first boot.

- Listing hero (680×409 on `/store.html#app=jsnes`): the lawn and the pad both read. It is the best moment of the 1P game.
- Grid card (~240×150): the lawn still scans; `P2 FRIEND` and `DROP A ROM` go muddy.

Worse: Lawn Mower is one player (library blurb, `players: 1`, help: "the second pad does nothing there"). The cover's red `P2 FRIEND` is the Invite pitch painted onto a cart Invite does not play. First boot is the Games sheet on a black CRT, not this frame. A cover that labels P2 on a 1P screenshot loses to jsnes.org's honest ROM list.

### Listing — COMP (overclaim = failed round)

Rendered at `/store.html#app=jsnes` (desktop). Title jsnes, tagline *The ROM and the save live in this file. Invite is player two.*, Unofficial port of JSNES, Install — free, 306 KB, signed gifos.app, abilities Saves data in the icon / Multiplayer. Hero is `cover.jpg`, zero App GIF requests. Copy matches `listing.json`. Credits name Firshman, Yerrick, Shiru. That shape is right.

Every lead claim against the running build:

| claim | running build |
| --- | --- |
| "jsnes.org is a tab that forgets the game when you close it" | jsnes.org persists dropped dumps in `localStorage`; samples re-fetch from jsDelivr |
| "keeps the cartridge and the battery save inside the GIF" | carts yes; `saves` collection empty; bundled ROMs have no battery bit |
| "hand the file to someone, and the same game is still in there" | baked samples yes; last-game prefs and user dumps live in `gifos.db` for this icon |
| "Nothing Nintendo ships in this file" | true (iNES homebrew, notices packed: COPYING-croom, COPYING-gpl-3.0, COPYING-lawn-mower, COPYING-jsnes, UPSTREAM) |
| "Send the invite. You stay player one; they are player two" | OS Invite is drawn; P2 was not joined in this run |
| "On a phone the pad is under your thumbs — d-pad, A, B, Start, Select" | d-pad and A/B yes; Start is under B at 390; Mute clipped |

Browse search `nes` on the 156-app grid returns Asteroids, Emoji Minesweeper, Fluence, Fortune Sheet — substring hits. **jsnes is not in `site/apps/index.json`.** `card[data-slug="jsnes"]` is absent. Distinctness holds vacuously: the store has no NES emulator, including this one. A stranger looking for NES never sees the listing. On a 390 viewport, `#app=jsnes` painted the browse page, not the detail.

### NES picture (desktop) — OURS vs jsnes.org, COMP vs FCEUX

Desktop 1100×820, integer 3× (768×720), CRT bezel, pixelated. Concentration Room and Lawn Mower both run. Arrows move. Enter is Start. Drop a dump loads it. Pause / Reset / Mute exist. F5 does not reload the tab (`preventDefault` on 116). This is JSNES 2.1.0 doing what JSNES does.

jsnes.org is the same engine in a website: more sample carts (five, fetched), a drop zone, key rebinding in `localStorage`, no file you can hand someone, a jsDelivr hop before the first pixel. FCEUX is the floor the original never was — ten savestate slots, debugger, TAS, Four Score, FDS, mappers JSNES will refuse. "As good as jsnes.org" is losing on a port. This is jsnes.org with two carts baked in. It is not FCEUX in a GIF.

### File-is-the-cart — OURS (narrow)

Baked samples load with no network. App-frame requests stayed on `127.0.0.1:8099`. Reopen restored Concentration Room. User dump persisted in `library`. jsnes.org cannot put a cart in your pocket. That is the platform win, and it is real. It is not the battery-save win the copy describes.

### Invite P2 — COMP (not shown)

Host chrome has Invite. App never draws it (correct). `Net` reports `owner: true, others: 0` solo. A guest tab was not obtained. Pad publish is 24 Hz in the shipped `net.js`. Until a second device is player two on Concentration Room → 2 Players, the tagline's second sentence is a promise.

### Phone — COMP

390×844, `body.touch` true, plus-shaped d-pad (~147px), B then A, Select/Start in the gutter. After picking Lawn Mower the title `PRESS START` is on a 256×240 screen. Start is under B. Mute is off the bar. Library first-boot covers the pad with a readable Games sheet — that part is fine. The playable state is not. jsnes.org has no NES thumb pad; ours drew one and then sat Start under B.

### No CDN / no Nintendo — OURS (walls held)

Packed files: `index.html`, `style.css`, `boot.js`, `emu.js`, `touch.js`, `net.js`, `roms.js`, `vendor/jsnes.min.js` (135 545, pin-checked), `help.md`, `credits.json`, five COPYING/UPSTREAM notices. Zero `http://` / `https://` / `cdn.` / Nintendo / Mario / Zelda strings in the GIF bytes. Sample ROMs are Concentration Room (GPL-3 + iNES-binary exception, "This product is not sponsored or endorsed by Nintendo") and Lawn Mower v1.12 (Shiru, public domain). App-frame network: origin only. jsnes.org loads carts from jsDelivr.

## Wall check

- **No remote load.** Held.
- **No Nintendo IP.** Held.
- **Saved data in gifos.db.** Prefs and library wrote. `saves` did not. Quick-state slot wrote; Load did not restore a distinct picture in this run.
- **Listing truth.** Failed round. Phone Start, battery save, "jsnes.org forgets," and Invite-as-P2 do not all hold of the build beside that copy.
- **Catalog.** `app.json` + GIF + `cover.jpg` + `/go/jsnes/` exist. Grid index does not list the slug. Distinctness: no NES emulator in the store.
- **minBuild 947 / unofficial `blessed: false` / Apache-2.0 inside the GIF / Invite is OS chrome.** Honest on paper.
- **No CDN.** Held.

## Bar check

Bar ONE is jsnes.org (the original) and FCEUX (where a NES bar should sit). jsnes.org is a thin, real website: five homebrew carts from jsDelivr, drop a dump, keys in `localStorage`. FCEUX is not mediocre. "As good as jsnes.org" would already lose on a port.

Bar TWO is why this should have won: offline, the cart in the icon, one Invite is controller 2, a thumb pad. Offline and the baked carts are true. Invite was not shown. The thumb pad cannot press Start on a phone.

Until a stranger can start Lawn Mower with a thumb and sit a friend on pad 2 from one link, the original's page is still the thing they will open.
