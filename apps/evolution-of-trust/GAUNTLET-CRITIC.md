# Gauntlet critic — The Evolution of Trust

Bar ONE: [ncase.me/trust](https://ncase.me/trust/) (Nicky Case, July 2017). Floor, not ceiling; this is a port.
Bar TWO: the file is the bookmark; one invite watches the same tournament; it runs on a plane and on a phone.

Driven 2026-08-30, one Chromium. Original played. Ours opened as the packed GIF inside `run.html`. Store listing opened at `store.html#app=evolution-of-trust`. Icon judged at 64px on a real Home Screen next to Welcome / Camera / Meeting.

## Winner

**COMP.**

The original plays. This copy does not. A stranger who knows ncase.me/trust opens this GIF and sits on a white screen that says `Cannot add resources while the loader is running.` There is no essay to bookmark, no tournament to invite anyone into, no phone fit to judge. “As good as” is already losing for a port. Shipping a copy that cannot start is not a round.

## Stranger-reason

You know the original — why would you use this one?

I would not. The original is a URL that loads, a handwritten PLAY, a thirty-minute explorable that still works on a phone-sized screen. This version is a 4.6 MB file whose loader dies before the splash peeps appear. Bookmark, invite, and offline are reasons I could recite from the listing. They are not reasons I can demonstrate. If I cannot say the reason back from *using* it, the run is not done.

## Single biggest remaining gap

**The sandbox boot is dead.** Packed assets land (100 keys in `TRUST.bytes`). PIXI’s singleton loader then hangs at ~33% on the three preload sprites (`splash_peep`, `connection`, `cssAsset13`). Two `XMLHttpRequest: Invalid URL` errors fire on every open — a srcdoc has no base URL, so a fetch-hook miss is not a 404, it is an exception. `startOriginal` throws PIXI’s `Cannot add resources while the loader is running.`, the boot gauge sticks on that sentence, `#main` stays `display:none`, `Words.text` never fills, Howler never starts. Reproduced twice.

Until PLAY appears, every other piece is theoretical.

## Pieces

### Icon — COMP (narrow)

Loop is 16 frames, 120 ms: gold coin passes left→right, right peep cheats (red X), left copies. That earns its loop — it is the Game of Trust, not a wiggle.

At 64px on the Home Screen it is two stadium-blobs and an X. It does not look like Nicky’s line-drawn peeps. Next to Meeting’s four faces it reads as “two people, something bad,” not “the trust essay.” Frozen on the cheat half of the loop (easy, it is half the frames) the coin is gone. A still of frame 0 (coin in the air) is the only frame that says the game.

### Cover — COMP, badly

Original marketing art (`ncase.me/trust/social/thumbnail.png`, 1200×600): two hat-peeps, the grey machine, the yellow/grey payoff diamond. Instantly the Game of Trust. At card size the diamond still reads.

Our `cover.jpg` is a procedural drawing from `icon.mjs screenshotPng()`, not a frame of the running app. Pixel font the essay never uses. A 16-peep geometric ring the tournament never draws (the real tournament is five hat-peeps on a flower). A “WHO WINS” panel that is not in the UI. A fake footer of dots. Mid-use, something happening — no: a fan illustration of a different game.

Blind at listing-hero 680px beside the original OG, and beside the real tournament slide (five peeps, handwritten “PLACE YOUR BETS,” Copycat / All Cheat buttons): COMP, then COMP again. The catalog bar for this kind of thing is the original’s own picture.

### Listing — copy is the right lead; the claims are not true of this build

Rendered on `store.html#app=evolution-of-trust` (the pretty `/store/evolution-of-trust` 404s on a raw static server; the grid search “evolution of trust” is **Nothing matches that** because `site/apps/index.json` does not contain the slug).

Tagline: *Close it mid-essay and you are still on that chapter. Send the invite and a friend watches the same tournament.* That is the stranger-reason, said in one card line. Description leads with the same, then the essay, then phone/Back/footnotes, then unofficial + public domain. Author is Nicky Case. License CC0-1.0. Blessed false. Donate to Patreon. Not a changelog.

An overclaim is a failed round. This listing ships beside a GIF that never reaches a chapter, never starts a tournament, never shrinks on a phone. “Works with no connection,” “keeps your place inside the file,” “one invite puts a friend in the same tournament” are not true of the build on the Install button. Parable of the Polygons’ listing is tighter and (from this critic’s chair) is allowed to talk about sliders that actually move.

### Essay / gameplay — COMP

Original: splash of the peep-network, PLAY, Christmas 1914, the machine, five characters, a flower tournament, evolution, noise, sandbox, credits. Futura Handwritten. Fan-translations and Facebook/Twitter/email share live in the footer. Thirty minutes. It is still the best version of itself that has ever existed, because it is the original and it runs.

Ours: the vendor tree is that essay (gh-pages `@ 6ec45d7`), with translations and sharing stripped on purpose. None of it is reachable in the GifOS sandbox. I cannot score “the port of the essay” until PLAY works. Code-reading is not a substitute for a round.

### Bookmark-in-GIF — no verdict on the product; the code is chapter-grained

`progress` is a private row: `chapter`, `furthest`, `mute`. Restore does `slideshow/scratch` to that chapter id, which is `slides.find` — the **first** slide of the chapter. Noise is eight sub-slides; tournament is four. Close it on a sentence, open it on the chapter title. The listing says “chapter,” which is honest wording for a feature I could not fire because boot dies first. A tournament in motion is not kept (`help.md` says so).

Original: no save. Closing the tab is starting over. That would be a real win *if this copy opened*.

### Invite tournament — no verdict on the product

`play` is host-written, guest-read. Chapter + sandbox knobs + start/step/reset, shared `TRUST.seed`. Guests get `pointer-events: none` on dots, buttons, sliders. Banner: “N friend is watching” / “Watching the same tournament.” Guests follow the host’s **chapter**, not the sub-slide — a friend who joins mid-match is supposed to see the same pond, not the sentence being read.

I never got a second context onto a running tournament. The host never left the boot gauge. Spectator-only is the right shape for an explorable (two people should not turn the pages), and it is still a reason the original cannot offer — after boot.

### Phone — original already usable; ours untested

Original at 390×844: splash and intro **work**. The peep ring fills the portrait, the Christmas 1914 text is readable, PLAY is tappable. Footer translations are a red smear. The 960×540 stage is not CSS-scaled; it is a window onto the middle. Good enough for the title and the essay pages. The machine and the tournament would clip; I did not get a clean original-phone tournament.

Ours: `fitStage` CSS-scales the 960×540 into the frame, sliders aim by `getBoundingClientRect`, Back steps a chapter, `body.phone` fattened dots. Untested. The listing’s “on a phone the whole stage shrinks to fit” is another claim sitting next to a GIF that never paints a stage.

### CC0 credit — listing yes; in-game not reached

Listing: “dedicated to the public domain,” license CC0-1.0, author Nicky Case, basedOn ncase/trust, donate Patreon. `COPYING.txt` and `vendor/LICENSE` are packed in the GIF. Credits slide (unreached) names Nicky, Axelrod, Patreon, Explorables; it does not say CC0, and neither does the original’s credits slide. Footnotes HTML is inlined (`notes-data.js`); I could read the Axelrod note out of `#notes-body` even on the dead boot. The in-app footnotes overlay itself never appeared.

Sound-replacement credit lives only in `COPYING.txt`, not on the credits slide.

### No stolen samples — packing looks clean

`vendor/assets/sounds/` has `button1.wav` / `button2.wav` / `button3.wav` / `bonk.wav` / `machine_start.wav` (short PCM 22.05 kHz mono) and no `button1.mp3` / `machine_start.mp3`. `build.mjs` refuses to ship the Owdeo CC BY-NC clicks and the lukaso CC Sampling+ slot-machine. Remaining mp3s match the upstream CC0 list (Komiku “Bleu”, coin, laugh, drumroll, …). Futura Handwritten is inlined as a data: font, not a CDN. I did not play a tone, because Howler never started (`howl: 0`).

## Wall breaks

These are not taste. They are the sandbox laws.

1. **The GIF does not run in the GifOS sandbox.** Srcdoc-relative XHR + PIXI.loader never finishing is a product that is not an app. Two pageerrors on every open.
2. **Catalog drift.** `site/apps/evolution-of-trust/{app.json,cover.jpg,evolution-of-trust.gif}` exist. `site/apps/index.json` does not list the slug. Store browse is empty for this name. `build.mjs` prints that catalog is owned elsewhere and refuses to regenerate it — so the committed catalog and this app have already drifted.
3. **Listing overclaim.** Bookmark, invite, phone, offline are sold next to a build that never reaches a slide. The gauntlet treats an overclaim as a failed round, not a style note.
4. **Cover is not a shot of the app.** The store art is synthesized. The gauntlet asked for the app caught mid-use. Combined with (1), there is no mid-use to catch.
5. Network-through-the-allowlist, no CDN, font inlined, `minBuild` 1206 for packed `.assets/`, COPYING inside the GIF, `progress` private / `play` read-only / `watchers` read-write, no `type=module`, sharing widget dropped — those walls are held in the *source*. They do not matter while the packed GIF cannot start.

## What would make me pick OURS

PLAY on the title, then the Christmas 1914 page, then the machine, in the real sandbox, offline, on a phone-sized frame, then close on the noise chapter and reopen still in noise, then one invite so a second window is watching the same tournament seed. After that, retake the cover from that running tournament (five hat-peeps, handwritten bets, not the pixel ring) and put the slug in `index.json` so the grid card exists.

Until then the original remains the one I would send a friend.
