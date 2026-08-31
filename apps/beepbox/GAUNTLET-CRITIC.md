# BeepBox gauntlet critic

Blind A/B against **beepbox.co** (BeepBox 4.2.2, same pin). Ran the shipped GIF in the real GifOS sandbox (desktop 1100×820 and phone 390×844), the store listing at `/store.html#app=beepbox`, and the live original in the same Chromium.

**Winner: COMP**

A stranger who knows beepbox.co does not have a reason to use this copy. The listing's reason is a sentence they cannot say back after using it.

## Stranger-reason

Asked: you know the original — why would you use this one?

The listing's answer is "the song lives in the GIF" and "one Invite is a jam on the same track." After a cold run, both are false of the build that ships beside that copy.

- `gifos.db('songs')` never received a row (`appGet(..., 'songs', 'current')` was `null` after first boot and after a close/reopen). Close it, come back: you get the same empty-looking seed the GIF always had, not a song you made.
- `window.BeepEditor` is never assigned. `BeepTouch.init` never runs. `BeepNet.init` never runs. Invite therefore cannot copy a song onto the room; a guest cannot land on "this same song." The jam attempt died on `BeepEditor.doc`.
- File still offers Copy Song URL, Shorten Song URL, View in Song Player, Copy HTML Embed Code. The listing says "no URL to copy."

The original's reason is still true and still the one a BeepBox user can say: the song is the URL; paste it. This port took that away and did not replace it with a working file-save or a working jam.

## Single biggest remaining gap

**The GifOS shell never finishes booting, so none of the platform powers attach.**

The vendored `SongEditor` paints. The shell around it does not. After load, iframe `window` keys are `gifos`, `GifOSBeepboxShim`, `BEEPBOX_SEED`, `beepbox`, `BeepNet`, `BeepTouch` — not `BeepEditor`. The lines in `boot.js` that persist the song, hide the URL traps, start pinch-zoom, and wire the room sit immediately after `new beepbox.SongEditor(...)`. They do not run.

The console is not quiet: the sandbox CSP is `script-src 'unsafe-inline'` (no `unsafe-eval`). The editor hits it over and over (`Evaluating a string as JavaScript violates ... 'unsafe-eval'`). That is the wall holding. It is also why this is not "the original tracker, plus a file." It is the original tracker with its persistence, share menu, zoom, and jam left unwired.

Until that boot actually completes, every other piece is painting over a hole.

## Piece judgements

### Icon — OURS

12 frames, 128², playhead walking a cyan/yellow/drum piano-roll on a dark rounded card. At Home Screen size (~64–96px) next to Camera / Meeting / App Store it still reads as a tracker, not a decoration. The loop earns its keep: the playhead is the thing the app is for. Tiny cyan/white chips under the roll turn to mud at 48px; they do not kill the read. Original is a website with no icon. This is the one piece that already wins.

### Cover — COMP

`cover.jpg` is a 1200×720 pixel-font illustration of a full roll, playhead a third in, "2 JAMMING", "THE SONG IS IN THE FILE." It is not a frame of the running app.

- Listing hero (680×409): readable as "chiptune tracker," toy-like next to Piskel's real mid-use screenshot or beepbox.co itself (the original's store art *is* the live editor).
- Grid card (~240×150, 16/10): the roll still scans; "2 JAMMING" and the file line die. `object-fit: cover` crops the sides, so the right panel is the first thing to go.

Worse: the cover shows a song that first boot does not. First paint is empty grey rows, tempo 148, pattern boxes 1/1/1/1. A cover that lies about the first minute loses to the original's honest empty grid.

### Listing — COMP (overclaim = failed round)

Rendered listing matches `listing.json`. Tagline is a good card line. Description leads with the platform reason, then how to click notes, then phone and Invite. Credits are honest (unofficial, bugs to GifOS).

Every lead claim is false of this build:

| claim | running build |
| --- | --- |
| "Close it, come back — the same notes are still on the grid" | songs db never written |
| "handing someone the GIF hands them the song" | user edits do not land in the file |
| "no URL to copy" | File still lists Copy / Shorten Song URL |
| "pinch or tap + / − to zoom" | zoom stays 100%; `+` does nothing |
| "a friend lands on this same song; either of you can change it, you both hear it" | BeepNet never inits |

The original's on-page copy ("All song data is contained in the URL… copy and paste the URL to save and share") is still the better listing because it is true.

### Tracker UX — COMP

Same 4.2.2 editor, worse chrome.

- Desktop (iframe 1100×788): pattern rows paint **twice**, above and below the roll. Button list is doubled (Play, Pause, Record, Zoom In/Out, Copy, Paste, Customize Instrument — each twice). beepbox.co at the same width is a single row layout, one Play, controls on the right. Our `#beepboxEditorContainer { max-width: 710px }` plus the editor's own `@media (min-width: 711px)` leaves an in-between that the original never shows.
- Piano roll is empty on first boot. Seed hash is set (`#9n31s0k0l00e03t2k…`, 186 chars, tempo 148, pad sequence 1,0,1,0) but no notes are on the grey rows. GAUNTLET.md's "4-bar pentatonic loop so the grid is not empty" is not what opens.
- HUD "The song is in this file" is a slogan over an unwired save.
- Play click never flipped the button to Pause in this sandbox (duplicate Play/Pause; AudioContext also has no `allow="autoplay"` on a db/multiplayer iframe).

A BeepBox user will prefer the original's page: one editor, URL updating as they type, instructions underneath.

### Song-in-GIF — COMP

Not implemented in the running GIF. Seed JSON is baked in `vendor/seed.js`; live edits never reach `gifos.db('songs')`. Reopen screenshot is identical to first boot. The original's URL-hash save actually moves when you change a note.

### Invite jam — COMP

Did not run. Host path throws on `BeepEditor.doc` before a share URL is even the interesting part. Original has no multiplayer — that is the intended win, and it is not there.

### Phone — COMP

390×844: BeepBox's own stacked mobile layout, plus a HUD that eats a row, plus zoom chips that do not zoom (label stays `100%` after `+`; `BeepTouch.init` never ran, so the 135% default under 710px never applies). Viewport scrolls (`scrollHeight` 1882 / `clientHeight` 771). Pattern boxes are tappable; the roll is still empty. beepbox.co's phone frame is the same editor without the dead HUD.

### No CDN — OURS (wall held)

App-frame network: nothing off `127.0.0.1:8099`. No webfont, no jsdelivr fetch. beepbox.co loads Roboto from `fonts.googleapis.com` / `fonts.gstatic.com`. The vendor still *contains* `https://cdn.jsdelivr.net/npm/lamejs@1.2.0/lame.min.js` and the File menu still offers the MP3 path because `hideFileTraps` never ran; the shim would block the script tag if boot finished. That is a trapdoor left open, not a fetch that happened.

## Wall breaks

- **No remote load.** Held. Zero off-origin requests from the app frame.
- **unsafe-eval.** Held, and it costs the product: 20+ CSP errors from the editor. The sandbox did not leak; the editor cannot finish.
- **Saved data in gifos.db.** Broken as a promise: the collection is declared, nothing is written, so there is no "data saved by this version still loads."
- **Listing truth.** Failed round. Overclaim, not a style note.
- **minBuild 947 / no network cap / unofficial blessed:false / MIT inside the GIF.** Honest on paper.
- **Invite is OS chrome.** Correctly not drawn by the app. Irrelevant until BeepNet inits.

## Bar check

Bar ONE (beepbox.co) is not mediocre. URL-as-save is the product. "As good as" would already lose on a port; this is worse than the original in the tracker, and the platform extras are unwired.

Bar TWO is why this should have won. It does not, yet.
