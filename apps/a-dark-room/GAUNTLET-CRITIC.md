# A Dark Room — gauntlet critic

Bar ONE: http://adarkroom.doublespeakgames.com/ (the original).
Bar TWO: the fire lives in the GIF; a phone can play; one Invite is the same fire.

Judged from the running original, the running GifOS GIF (`site/apps/a-dark-room/a-dark-room.gif`), the listing at `/store/a-dark-room`, and a phone-sized sandbox (390×844). Labels stripped: A is the white-page original, B is this GIF.

## Winner

**COMP**

Desktop B is the original with the lights already off. That is not a reason to switch. The one structural win that is actually true — the save is the file — is not enough, because the face of the product (cover, store grid, phone) is either a costume, missing, or broken, and the listing overclaims the phone.

## Stranger-reason

You know the original. Why use this one?

*Almost:* the fire is inside the GIF. Close the tab, copy the file, open it somewhere else — still burning. The original is stuck in that browser’s `localStorage` unless you export a code. Sound is packed; nothing is fetched from doublespeakgames.

A stranger cannot say that and then *do* it from the store: searching “a dark room” on the grid returns **Nothing matches that.** Opening it on a phone — the original’s actual weakness — yields a black screen and the log, no **light fire**. Until those are true, the answer is a shrug.

## Single biggest remaining gap

**On a phone the room is not on the screen.**

At 390×844 the 720px reflow sets `#outerSlider`, `#outerSlider > div`, and `#locationSlider` to `display: none !important`. `#roomPanel` is `.adr-active` and `display: block`, but it is 0×0 because its parents are `none`. Measured: `lightButton` 0×0, `header` 0×0, `notifications` the only visible game chrome (log at y≈576). The listing says *“the buttons are thumb-sized, the log sits above the room, and a pad under the map walks the wanderer.”* That is false of the build it ships beside. Help repeats the same sentence.

The original is honest: a phone UA lands on `mobileWarning.html` and points at native apps. B promises to play and then hides the game.

## Wall breaks

1. **Catalog drift.** `site/apps/a-dark-room/{a-dark-room.gif,app.json,cover.jpg}` exist. `site/apps/index.json` does **not** mention `a-dark-room`. The pretty listing URL still opens (`app.json`). The grid does not list it; search does not find it. `build-app-catalog.mjs --check` cannot be green for this app until the index is regenerated. A stranger browsing Games never sees it.
2. **Listing overclaim** (gauntlet copy wall, not sandbox): phone play, as above. Every claim must be true of the build it ships beside.

Not a wall: audio is vendored. 86 FLAC under `.assets/audio/`, `audio.js` has no `fetch`, `boot.js` loads through `gifos.assets`. Original `loadAudioFile` does `fetch(window.location + src)` against the host. Packed `COPYING-adarkroom.txt`, `COPYING-jquery.txt`, sealed `credits.json`. `minBuild` 1206 matches packed `.assets/`. Save is `gifos.db('save')`; closing the tab and reopening still showed **A Firelit Room** / *the fire is burning.*

## Pieces

### Icon — COMP (the Home Screen)

Installed, it is a nearly black rounded square with a pinprick of orange, sitting next to Camera and Welcome. At 64px it does not read “A Dark Room”; it reads “empty dark tile.” The 12-frame grow-the-fire loop is the right idea and does not survive icon size. A stranger scanning the Home Screen will miss it.

### Cover — COMP (the catalog)

Judged at listing hero and against 2048 / Chess Grandmaster (those covers *are* the running product).

B’s cover is a pixel-font mockup: block “A FIRELIT ROOM”, a cartoon flame, STOKE FIRE in a bitmap face. The running app is Times New Roman, same as A. There is no pixel fire in the game — the fire is a sentence in the log. The cover footer says LIGHTS ON; the listing says lights start off. It is mid-use content in the *wrong game*. 2048’s card shows the real tiles. This one would not survive a blind “which screenshot is this app?”

### Listing copy — COMP on truth, OURS on the lead sentence

Tagline on the rendered page: *“The fire lives in the file. Close the tab — still stoking. Invite someone to the same fire.”* That is the right lead, and the first paragraph is the reason to switch, said plainly. Author is Townsend, porter GifOS, unofficial-port pill, MPL-2.0 in the facts, bugs to GifOS. Good.

Then it spends a paragraph on a phone that does not play, and the card never appears on the grid. An overclaim is a failed round.

### Fire / village / world — tie on desktop, COMP on honesty of the cover

A: white page, *the fire is dead*, **light fire**, languages, github / get the app / share. Sound Available modal. After light: *the fire is burning.*

B, desktop: the same room, lights already off, no store-splash chrome. Light fire works. Village and Dusty Path come up as the original (stores, build trap/hut/lodge, outfitting, embark). Default dark makes the original cooldown (`div.cooldown` `#DDDDDD`) a blank light slab over `#EEE` text — stoke looks like an empty white bar. That is A’s dark theme, now the first-run. World map was not walked live (embark sits on a 120s death cooldown with an empty pack); the engine is the vendored one.

A port that looks like the original is losing. B has not yet *become* the best version of this game.

### Save-in-GIF — OURS

Lit the fire, closed the page, opened the same file id. Still **A Firelit Room**, *the fire is burning.* The file is the save. A is `localStorage` on that origin.

### Shared fire Invite — not proven live

`net.js` is host-simulates / guest-sends-`.button` clicks / host publishes `fire`. Help and the listing state it as fact. A live two-context join was not completed here. Guest forwarding only intercepts `.button` with an id — the D-pad is `.adr-dir`, so even if the room were visible on a phone, map walking would not be a shared fire. Do not treat the invite paragraph as true until a guest stokes and the host woodpile moves.

### Phone — COMP, and the listing is wrong

A / iPhone UA: *“A Dark Room isn’t mobile-friendly… There are native apps.”* App Store + Play buttons.

A / 390px with `?ignorebrowser=true`: cramped desktop, playable, menu piled on itself.

B / 390px: Sound Available, then a black viewport and the log. No light, no stoke, no village, no map, no pad. See the gap above.

### MPL notice — OURS (adequate)

Help → Credits: *License MPL-2.0 — Copyright (c) Michael Townsend and doublespeak games*, based-on, homepage, *Sealed inside this GIF and signed by gifos.app.* Listing facts repeat MPL-2.0. Full text is packed as `COPYING-adarkroom.txt` (and jQuery MIT). Source link is the tree. Not shown as a first-run plaque; enough to find.

### Audio from GIF, not CDN — OURS

86 FLAC in `.assets/audio/`. Loader is `gifos.assets`, no `fetch` in packed `audio.js`. Original fetches FLAC from its own host on enable. B does not touch doublespeakgames for sound.

## What would make the next critic pick OURS

A stranger who knows the original searches the store, finds the card, sees a cover that is *this* Times-New-Roman room mid-stoke, installs, lights the fire on a phone with a thumb, closes the tab, opens the GIF, still stoking, and can say the reason without being prompted. Right now they cannot find it, the picture is of another game, and the phone has no room.
