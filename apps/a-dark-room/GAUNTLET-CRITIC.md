# A Dark Room — gauntlet critic

Bar ONE: http://adarkroom.doublespeakgames.com/ (the original).
Bar TWO: the fire lives in the GIF; a phone can play; one Invite is the same fire.

Judged from the packed GifOS GIF (`site/apps/a-dark-room/a-dark-room.gif`, 5 307 861 B, stamped 2026-08-31), the listing at `site/apps/a-dark-room/app.json`, and a phone sandbox: `run.html#id=` at **390×844**, iframe 390×812 under a 32px OS bar. One Chromium. Labels stripped: A is the white-page original, B is this GIF. Invite was not two-tabbed.

## Winner

**OURS**

A phone can light the fire. That was the last critic’s product red, and it is gone. The original still sends a phone UA to `mobileWarning.html`. B puts **light fire** on the glass, 132×44, and a tap turns the room into **A Firelit Room**. The file is still the save. The cover is this Times New Roman room, not a costume. Desktop B is still the original with the lights already off — that alone is not a switch. The phone is.

## Stranger-reason

You know the original. Why use this one?

The original is stuck in that browser’s `localStorage` and will not play in a phone browser. This copy is a file: close the tab, still burning. On a 390px thumb it is the same room, log above, light/stoke at 44px. Sound is packed; nothing is fetched from doublespeakgames.

A stranger still cannot *find* it by searching the store grid. The listing URL opens; the catalog index does not know the slug. That is a shipping hole, not a reason to go back to A.

## Single biggest remaining gap

**Invite is half the tagline and has not been shown to work. A guest on a phone cannot walk the map even if it did.**

`net.js` forwards only `.button` nodes that have an id. The D-pad is `.adr-dir` with `data-dir`, no id. Help and the listing say a friend sits at the same fire and can stoke, gather, and build; they also say the pad walks the wanderer. Neither was proven live. A guest tap on ▲ never becomes a host step. Do not treat the Invite sentence as true until a second context stokes and the host woodpile moves, and a guest pad step moves `@`.

The letter grid on a very small phone was not walked this round. That is the next place a thumb will fail.

## Wall breaks

1. **Catalog drift.** `site/apps/a-dark-room/{a-dark-room.gif,app.json,cover.jpg}` exist. `site/apps/index.json` does **not** mention `a-dark-room`. Search on the grid still cannot find it. `build-app-catalog.mjs --check` cannot be green for this app until the index is regenerated. A stranger browsing Games never sees the card. The listing URL itself still paints.
2. **Invite copy** (gauntlet copy wall, not sandbox): claimed, not measured. Every claim must be true of the build it ships beside.

Not a wall: phone play. Measured below. Audio is vendored (86 FLAC under `.assets/audio/`, loader is `gifos.assets`, packed `audio.js` has no `fetch`). MPL text packed. `minBuild` 1206 matches packed `.assets/`. Save path is still `gifos.db('save')` (not re-closed this round).

## Phone — measured 390×844

Iframe 390×812 at y=32. `#outerSlider` is `display:block`, 366×102, in flow. `#roomPanel` is `.location.adr-active`.

| node | boot (after Sound dismiss) | after tap |
|---|---|---|
| `#lightButton` | **132×44 at (12, 134)** display flex, fully on screen, text **light fire** | display none (spent) |
| `#stokeButton` | display none | **132×44 at (12, 208)** text **stoke fire** |
| `#notifications` | 366×56 at (12, 8) — *the fire is dead. / the room is freezing.* | 366×130 — *the fire is burning.* |
| `#header` | *A Dark Room* 366×46 at y=76 | *A Firelit Room* at y=150 |
| fire | `{value:0, text:"dead"}` | `{value:3, text:"burning"}` |
| `scrollWidth` | 390 (678 while the Sound modal was up) | 390 |

A tap on **light fire** succeeded. Title became **A Firelit Room**. Stoke sat on its cooldown with a dim brown fill (`rgba(160,140,90,0.35)`), not the original dark-theme white slab. Log is above the room. Menu (*sound on. lights on. hyper. restart. save.*) is a 29px row at y=773. D-pad is in the DOM, hidden on the room screen (correct). No app-frame errors.

First paint is the original **Sound Available!** modal (374×185 at y=90), covering the button until enable/disable. After that choice, light fire is free. That is A’s modal, not a hidden room. The previous 720px `display:none !important` on `#outerSlider` is gone.

## Pieces

### Icon — OURS at the OS pill, Home Screen not recaptured

The 32px fire in the run bar is a flame, not an empty dark tile. The grow-the-fire loop is the right idea. A 64px Home Screen crop was not taken this round.

### Cover — OURS

`cover.jpg` / `screenshot.png` is the running Times New Roman room: *the fire is burning. / the room is warm.*, **A Firelit Room**, **stoke fire**, stores wood 18, lights already off. It would survive a blind “which screenshot is this app?” The previous pixel-font costume is gone.

### Listing copy — OURS on the phone paragraph, COMP on Invite

Tagline: *“The fire lives in the file. Close the tab — still stoking. Invite someone to the same fire.”* Phone paragraph is now true of the build: light fire is on the screen, buttons are thumb-sized, log sits above the room. “A pad under the map walks the wanderer” is machinery in the tree (`#adr-pad`), not shown on this room screen. Invite is the overclaim.

### Fire / village / world — OURS on the room, unwalked past it

A: white page, *the fire is dead*, **light fire**, phones bounced.
B, 390px: the same room, dark, playable, log stacked, 44px verbs. Village, Dusty Path, and the letter map were not opened this round.

### Save-in-GIF — OURS (not re-closed)

Previous critic lit the fire, closed the page, opened the same file id, still **A Firelit Room**. Code path unchanged (`db('save')`). Not re-proven here.

### Shared fire Invite — not proven live

See the gap. Host publishes `fire`; guests send `.button[id]` clicks. The D-pad is not a `.button`.

### Phone vs A — OURS

A / iPhone UA: native-app splash.
A / 390px with `?ignorebrowser=true`: cramped 700px desktop.
B / 390px: the room, the log, the thumb button, a working light. That is the bar.

### MPL notice — OURS (adequate)

Unchanged: Help → Credits, packed `COPYING-adarkroom.txt`, listing facts MPL-2.0, unofficial-port pill.

### Audio from GIF, not CDN — OURS

Unchanged. 86 FLAC. No `fetch` in packed `audio.js`.

## What would make the next critic keep OURS

A stranger who knows the original searches the store, finds the card, sees this Times New Roman room, installs, lights the fire with a thumb, invites someone, and that someone stokes *and* walks `@` on the pad. Right now they can light the fire. They still cannot find the card on the grid, and the Invite sentence is a hope.
