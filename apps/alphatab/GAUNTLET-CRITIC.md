# alphaTab — gauntlet critic

Blind A/B against **alphatab.net** (CoderLine alphaTab 1.8.4 — the same pin — and its tutorial player at `/docs/tutorial-web/player`) and **Guitar Pro 8** (Arobas; editor, backing track, loop, mixer). Played the shipped GIF `site/apps/alphatab/alphatab.gif` in the real GifOS sandbox (`run.html#id=…`, desktop 1100×820 and phone 390×844). Listing read on `/store.html#app=alphatab`. One Chromium. Invite was not two-tabbed.

This is not guitar-bro. guitar-bro is a falling-notes trainer with Listen/tap scoring and a race. This is a notation renderer and synthesizer. The two do not compete.

**winner:** COMP

**single biggest remaining gap:** The shopper never meets the product that actually plays. Store search for `alphatab` is **"Nothing matches that"** (`site/apps/index.json` has 156 apps and no `alphatab`; `app.json` + the signed GIF exist). The listing hero they would have seen is a pixel-font TAB strip at **01:12 / 02:04**. The GIF that runs is a real Bravura **score + tab**, **00:00 / 00:32**, cursor walking bar 1 then bar 3. Until the catalog lists it and the cover is a frame of that score, bar TWO is a sentence on a page nobody reaches.

**would a stranger who knows the original use this copy:** "alphatab.net is a library with a demo that loops, counts in, prints, and mixes tracks. Guitar Pro is the editor I already paid for. This one is the same engine in a GIF, Greensleeves already open, offline, Invite in the bar. I would use it on a plane to open a `.gp` without installing GP — if I could find it in the store, if the cover was the score I get, and if a friend who opened Invite actually followed the playhead. I did not get those three. I will not leave GP for a 32-second public-domain snippet behind a WASM consent wall and a copyright line sitting on the tab."

**HARD WALL:** catalog. `site/apps/alphatab/{alphatab.gif,cover.jpg,app.json}` exist (1.3 MB, signed `gifos.app`). `site/apps/index.json` has no `alphatab`. Browse search is empty. The deep link still renders from `app.json`. Runtime wall is clean: app-frame requests stayed on `127.0.0.1:8099` / `blob:` / `data:`; zero CDN, zero jsdelivr SoundFont, zero webfont. `allow` on the iframe is `null` (no `autoplay` grant); Play after a click still started. `sandbox="allow-scripts allow-forms allow-downloads"`. `COPYING-alphatab.txt` / Bravura / SONiVOX ride in the GIF. `capabilities.network` absent. Listing claims checked against this run: unofficial, Daniel Kuschny, MPL-2.0, Greensleeves on first boot, cursor walks, Play sounds the synth (time 00:01 → 00:04, `.at-highlight` on, `follow.cursor.playing: true`). "A friend lands on this same tab, on the same beat" was not a second tab. "Close it, come back" was written to `save.last` (Greensleeves `.tex`, 853 bytes) and not reopened.

## Face (always judged)

- **Icon (64px):** Home Screen after install: dark rounded card, six strings, tab numbers, a red playhead. It reads "tab" at real icon size next to Meeting / App Store. Twelve frames, the loop is the playhead walking — it earns it. alphatab.net and Guitar Pro have no animated Home Screen icon. This piece wins the slot and does not yet earn the catalog hole under it.

- **Store art:** `cover.jpg` / `screenshot.png` is a 1200×720 pixel-font illustration: OPEN / GREENSLEEVES / TAB `0 3 5 7 8…` / PAUSE **01:12 / 02:04**. It is not a frame of the running app.
  - Listing hero: readable as "guitar tab," toy-like next to the live Bravura score the GIF actually paints.
  - Grid card / phone listing: the fake duration and the TAB-only picture survive; the real product (treble clef, 6/8, *f*, two staves) does not appear.
  - First boot is 00:00 / **00:32**. There are no repeats in `sample.tex`. The cover invents a minute and a half.

- **Listing copy (read on `/store.html#app=alphatab`):** Tagline *The tab lives in the GIF. Invite, and a friend follows the playhead.* Description leads with file-is-the-save / plane / Greensleeves, then Play, then Invite. Credits are honest (unofficial, bugs to GifOS, Daniel Kuschny). That is the right shape. Deep link renders it. The grid a stranger browses does not. "01:12 / 02:04" is not in the copy; it is on the hero, which is worse — the picture lies where the sentences don't.

## Product notes (not the gap, but they sit on the table)

- **Notation renders.** Yes. Four SVGs, font `alphaTab:loaded`, SMuFL glyphs, "Guitar Standard Tuning", ♩=88, 6/8, *f*, bars 1–16, TAB under the stave. This *is* alphaTab 1.8.4. Blind on the page of music, this ties alphatab.net's renderer, because it is that renderer. Guitar Pro 8 is an editor of the same files; the paint here is a player.

- **It plays.** WASM consent modal ("Run a compiled engine on your device") sits on first open and eats the first click. After Confirm & Save: Play → Pause, time 00:01 / 00:32 then 00:04 / 00:32, bar cursor a beige band + red beat line, current notes highlighted. `gifos.db('follow').cursor` pulsed `playing: true`, `tick: 5885`, `time: 4179`. Headless Chromium was muted; the transport and the cursor moved. The iframe has no `allow="autoplay"` — a gesture was required and was enough.

- **Song in the GIF.** `save.last` and `song.file` both held the Greensleeves alphaTex after first boot. That half of bar TWO is true of this build. Reopen was not re-run here. Files over 8 MB are documented as session-only.

- **Stave / layout chrome lies.** Clicking **Both** did switch the paint (TAB-only, then score-only) and left the chip labelled **Both**. `applyDisplay` never calls `paintChrome`. Zoom does. Play/Pause does. The control the person looks at to know what they are seeing does not.

- **Default alphaTab footer.** "Public Domain / All Rights Reserved - International Copyright Secured / rendered by alphaTab" stacks on itself at the end of the page layout, and on the phone it sits **on the tab stave**. A public-domain seed should not wear a rights-reserved stamp, and nothing should sit on the strings.

- **Phone (390×844).** Layout correctly **Scroll**, zoom **85%**, Play 48px at y=692 of 812 (thumb). Horizontal strip `scrollWidth` 3503. Playhead moved, time 00:01. Then the rest: GifOS bar + app chips wrap, **+** drops onto its own row, **Click** wraps under the transport, copyright line across the TAB, meet copy `display:none`. alphatab.net's tutorial player keeps count-in / loop / print / mixer in one footer and does not wrap a zoom button onto the score.

- **Missing vs bar ONE, and not close.** alphatab.net's own player tutorial ships count-in, loop, print, track sidebar, zoom 25–200%, soundFont progress. Guitar Pro 8 ships an editor, 100+ sounds, A-B loop, backing-track audio, chord/scale diagrams, a mixer. This chrome is Open / Both / Page / zoom / Play / Stop / Speed {50,75,100,125,150} / Click. Track names appear only when there are two. No loop. No count-in. No print. No pan/solo/mute. No click-to-seek proven. No GP8 backing track (GAUNTLET.md already says so). A port of a library that "as-good-as" the library's own demo is still losing; this is thinner than the demo.

- **Invite.** `#appinvite` is OS chrome, visible, labelled Invite. `lead` hidden while solo (correct). Host published `follow.cursor` while playing. A second tab was not joined. The listing's "a friend lands on this same tab, on the same beat" is therefore unwitnessed, not falsified.

- **No CDN.** Held. alphatab.net's tutorial loads `@coderline/alphatab@latest` and `sonivox.sf2` from jsdelivr, plus Font Awesome. Ours inlines the UMD, blobs the worker, `loadSoundFont`s SONiVOX from a packed `data:` href. That wall is the one piece that already beats the original site.

The run can leave on "the engine in the GIF paints and plays Greensleeves offline." It should not leave until a stranger can search the store, see the real score on the card, and send Invite to a second device that follows the beat. That is bar TWO. It is why this exists instead of alphatab.net. It is not done.
