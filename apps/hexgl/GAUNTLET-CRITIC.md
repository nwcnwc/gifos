# HexGL — fresh-eyes critic

Blind A/B against **COMP** http://hexgl.bkcore.com/ (play page + OG ship art) and **OURS** the shipped GIF in the GifOS sandbox (`run.html#id=`, store at `/store.html#app=hexgl`, Home Screen at 64px). Desktop 1280×800 and phone landscape 844×390. One Chromium. Labels stripped while playing; names restored here.

The original is the floor, not the ceiling. This is a port: “as good as” would still be losing.

## Winner: OURS

The running race **is** HexGL. First live frame after Start is Cityscape at dawn: metallic hex track, glass scrapers, the blue Feisar with HTML5 / WEBGL marks, START banner, hex-vignette HUD, `1/3`, shield 100, “Get ready / 3”. Same engine, same ship, same track. 23 blob texture URLs and 9 geometries landed; zero requests left `127.0.0.1:8099`.

COMP on that same visit is a 3D-ship splash (Quality: High, Platform: Desktop, Godmode: Off) that then pulls textures off a web server and phones home to `www.google-analytics.com`. It has no friends on the track, no file that is the save, and its phone controls are an invisible half-screen stick that reloads the page on four fingers.

Ours is the copy you can take on a plane, whose best time lives in the GIF, with thumbs you can see, and an Invite in the OS bar. That is the reason. It is not a haircut of a mediocre original — HexGL was already the WebGL racer — it is the version that no longer needs hexgl.bkcore.com.

## Stranger-reason

You know hexgl.bkcore.com. You use this one because the whole Cityscape rides in a 4.0 MB GIF, so it still races with the network cut; close it and the best time is in the file you can hand someone; on a phone the left pad steers and GO sits under the right thumb; press Invite in the bar and extra ships are ghosts on the same line. No account, no server, no analytics.

Said back: *It’s HexGL that works on a plane, and the GIF is the save — send the link and they race a ghost of you.*

(The last clause is the weak joint. See the gap.)

## Single biggest remaining gap

**The store face is not HexGL, and the grid does not contain it.**

`/store.html#app=hexgl` renders. Search the store for `hexgl`: **“Nothing matches that.”** `site/apps/index.json` (156 apps) has no `hexgl`. A stranger browsing Games never sees it. The listing URL is a secret handshake.

When they do land on the listing, the hero is a 1200×720 **drawing**: a flat orange dart on a striped triangle road, fake `1'08''42` / `LAP 2/3` / `412`, grey bar-buildings, a cartoon sun. It is `icon.mjs` `screenshotPng()`, not a frame of the race. At card size it looks like a cheap flash racer. At hero size it is a different game. COMP’s splash is the actual Feisar over a blurred Cityscape. Chess Grandmaster and the Bible covers in this catalog are photographs of the thing you get. The live window (START banner, dawn sky, the real ship) is the cover they should have taken. `coverCrop` is absent; there is no shell in the drawing because there is no game in the drawing.

Until a shopper who knows hexgl.bkcore.com can **find** this and **recognise** it as Cityscape, bar two does not get a chance.

## By piece

**Icon.** OURS. Home Screen, 64px, next to Camera / Welcome: orange dart on a cyan hex-track inside a dark sticker, `v1.0.0` pill, label HexGL. Twelve frames, 100 ms: the track zooms and the ship surges at the camera. It earns the loop. COMP has a still favicon; it does not have a Home Screen.

**Cover.** COMP, not close. See the gap. Ours sells a poster. COMP sells the ship.

**Listing copy.** Shape is right, and it leads with the reason: *The original futuristic racer, offline — your best lap lives in the GIF, and Invite is a ghost race.* Body: plane, file-is-the-save, Invite in the bar, three laps, boost pads, shield, WASD / Q-E, phone thumbs, weaker GPU gets a smaller picture, unofficial port of Thibaut Despoulain, MIT. Rendered page shows Unofficial port, 4.0 MB, signed by gifos.app, minBuild 1314, abilities db / multiplayer / fullscreen. Author is Despoulain, porter GifOS, blessed false. Claims that were true in this run: Invite is OS chrome (the app never draws that button), textures/geoms/audio are in the GIF, `gifos.db` `prefs` accepted a best of `188042` and a replay. Soft / failed: “whoever opens it races a ghost of **you**” reads as a packed best-lap, not an 8 Hz pose of whoever is flying *now*. A late joiner does not get the host’s best from the start. That is an overclaim, not a style note.

**WebGL race feel.** Tie on the first second, COMP on the quality ceiling. Idle frame is HexGL. Quality here is Mid (`quality: 1`) which still loads the LOW texture set (Cityscape.js `quality < 2`); original’s play page offers High and ships bloom/FXAA at quality > 2. Ours never exposes High. The ship, scrapers, dawn skybox, hex HUD and countdown are the original. Keyboard from the parent page did not reach the iframe in this pass, so WASD was not proved end-to-end; a later frame showed the ship in the clouds with “Destroyed” after a busy box (load 9–16 on 6 cores) — that is not a physics verdict.

**Touch steering.** OURS vs the original’s invisible stick. Overlay is real: left disk ~115×115, GO ~99×99, BRAKE ~70×70, safe-area padded, analog `stickVector` into the vendored ship. It appears as soon as the screen is coarse/narrow, **including on the menu and over the fullscreen permission sheet**. Original `controlType == 1` is an invisible left-half stick plus right-half accelerate, and four fingers `location.reload`. We do not vendor `TouchController`; `controlType` is 0. Phone race itself did not leave the perm modal in this pass, so GO→speed was not measured. The pads are there and they are the right idea.

**Ghost invite.** Platform win on paper, half a product. `Net.publish` at 8 Hz, translucent tinted Feisar, roster board, `players` read-write, nobody writes anyone else’s row. Solo still races the saved replay ghost (`RaceData` + `ghostMesh`). Live guests are pose-only interpolations of *now*. COMP has no room at all. One Chromium, so two-tab join was not driven; the listing’s “ghost of you” is the claim that still has to become true.

**Best lap in the GIF.** OURS. `gifos.db` `prefs` `{best, replay, mute, quality, hud}`. Write in this session kept. Original stores `localStorage['score-Cityscape-casual']` and a replay string on that origin (and `JSON.Stringify` is capital-S in the vendored `HexGL.js`, so even COMP’s own save is on a knife edge). Ours is the file. Reopen-the-icon to see `Best 1'08''42` on the menu was not re-run after the write.

**Phone.** Playable chrome, unfinished first minute. Landscape 844×390: GifOS Invite/Save/Help/Abilities plus a fullscreen permission card (“Fill the whole screen, and hold your phone’s picture sideways”) with the touch pads already showing through it. COMP’s play page is a desktop splash. Ours is the one that *has* thumbs. The perm sheet is platform law, not a wall break; it did eat the first Start.

**No CDN textures.** OURS, wall held. App requests: origin + `blob:`. COMP: `hexgl.bkcore.com` + Google Analytics. Packed `.assets/` matches `ASSET-LIST.txt` (LOW diffuse, skybox, HUD, five oggs, cityscape geoms). `connect-src` can be none. `vendor.mjs` is the pin, not the GIF.

## Walls

- **Broken: catalog index.** GIF, `cover.jpg`, and `app.json` are on disk and the listing URL paints. `site/apps/index.json` does not contain `hexgl`. Store search cannot find it. Same hole the Hextris / Flexbox Froggy critics already named. `node scripts/build-app-catalog.mjs --check` is the gate; this app is not in the committed catalog.
- **Held:** no CDN / webfont / remote at load; no `localStorage` used by the shell (the vendored `displayScore` still *mentions* it, but our finish screen does not call those nodes); saved data is `gifos.db` only; manifest `db` + `multiplayer` + `fullscreen`, no `network`; `minBuild` 1314 as the listing says; MIT notices packed (`COPYING-hexgl.txt`, `COPYING-three.txt`, `COPYING-audio.txt`); cover is JPEG, not the GIF; Invite is OS chrome.
- **Listing honesty:** “ghost of you” overclaims the packed replay. Solo ghost of *your* best is real; the invite is a live silhouette.

## A/B

Put a stranger who has raced Cityscape on hexgl.bkcore.com in front of both.

COMP: High-quality splash, the Feisar they remember, then a server, a ladder that is closed, analytics, localStorage, no friend, a phone that fights them.

OURS: a store that does not list it, a cover that looks like a different game, then — if they have the deep link — the same dawn track, offline, the file is the save, thumbs, Invite.

They will use COMP until they can find this in the grid and the card is a photograph of that START-banner frame. After that the plane / the GIF / the link is the reason, and it is enough. Until then the run is not done.
