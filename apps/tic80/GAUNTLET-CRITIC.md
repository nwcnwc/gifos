# TIC-80 gauntlet critic

Blind A/B against **TIC-80 1.1.2837** (the engine this tree vendors — tic80.com in a tab, or the HTML export you install) and **PICO-8** (paid; carts not ours to ship). Distinct from Bitsy. Played the packed `site/apps/tic80/tic80.gif` (decoded, 14 files, official 5.7 MB wasm). Desktop 1280×800 and phone 390×844. Store listing at `/store.html#app=tic80`. `/?run=tic80` in the real sandbox got as far as the wasm/fullscreen permission sheet (Invite is OS chrome). One Chromium. No commercial PICO-8 carts were opened or copied.

**Winner: COMP**

A stranger who knows TIC-80 — or who paid for PICO-8 — does not have a reason to use this copy. The listing's reason is a sentence they cannot say back after using it.

## Stranger-reason

Asked: you know the original — why would you use this one?

The listing's answer is "the cart lives in this GIF" and "Invite, and they play the one you just made." After a cold run, both are false of the build that ships beside that copy.

- `boot.js` launches with `arguments: ['--skip', '--cmd', 'load hello & run']`. GAUNTLET.md round 3 writes `--skip --fs=/work --cmd "load hello & run"`. **`--fs=/work` is not in the GIF.** IDBFS never mounts. `TicFS.seed` never writes `hello.tic` / `fire.tic`. Console on first Start:

      hello! type help for help
      >load hello
      cart loading error
      >run

- HELLO WORLD still paints. That is TIC-80's **baked-in default cart**, not the GIF's `hello.tic`. `run` after a failed `load` runs whatever is already in RAM; 1.1.2837's default happens to be the same luademo. Swap the default to Fire and first boot would be an empty machine with an error in the log.
- `gifos.db('disk')` was `[]` after Start. `TicFS.listCarts()` was `[]`. Carts sheet: "On the desk — None yet." Close it, come back: nothing you could have saved is there, because nothing could be written.
- Carts sheet HELLO WORLD / Fire only `putCart` + rename the overlay. They do not send `load` / `run` to the engine. Even with a disk, tapping Fire would not play Fire.
- Invite is OS chrome (true). The desk has no carts on it (false). Pads published one empty row. A guest cannot land on "the one you just made."

tic80.com's reason is still true: play a cart in a tab, it forgets when you close. The desktop HTML export's reason is still true: `--fs` is a real folder. This port took the forgetting-tab problem and did not replace it with a working disk.

PICO-8's reason is still true and still paid: 128×128, Splore, the BBS. We did not steal those carts. We also did not give a PICO-8 owner anything they can use — different machine, no disk, no Splore.

## Single biggest remaining gap

**`--fs=/work` is missing, so the disk is not in the file.**

`fs.js` patches `IDBFS.syncfs` and seeds `/work`. That patch is dead code until the engine mounts IDBFS, and the engine only mounts IDBFS when `--fs` is on argv. The console's `cart loading error` is the product saying so. Until `load hello` actually loads the cart from `gifos.db`, Bar TWO is a caption on a computer that forgets the same way tic80.com does.

The HELLO WORLD picture is not the win. It is the engine default covering for a load that failed.

## HELLO WORLD on the 240×136 screen

**Yes, the picture is there.** After Start, the canvas is the real 1.1.2837 framebuffer: light sweetie-16 `cls(13)` (`#94b0c2`), the walking computer sprite, `HELLO WORLD!` in colour 15. Engine integer-scales 240×136 into the canvas and letterboxes the rest in navy. Console banner: `TIC-80 tiny computer version 1.1.2837 (be42d6f)`. That is Bar ONE's floor, and it holds as a picture.

It does **not** hold as "the cart in this GIF." See the load error above.

Cover / first boot disagree. `cover.jpg` is a painted **dark** CRT bezel, white `HELLO WORLD!`, scanlines, a `HELLO` HUD chip. First paint is the **light** grey-blue playfield with no bezel. A cover that lies about the first minute loses to tic80.com's own demo GIF, which is the machine.

Escape during play is the **game menu** (RESUME / RESET / CLOSE GAME / OPTIONS / QUIT TIC-80), not the console. `help.md` says "Escape is the console." That is the real TIC-80 surf menu. CLOSE GAME is how you get a prompt. The overlay Carts sheet repeats the same lie in the footer (`load fire then Enter`).

## Phone pad

**The pad is there and it is the right shape.** 390×844, `body.touch.on`, no page scroll (`scrollHeight === clientHeight === 844`):

- Plus-shaped d-pad, bottom-left, 131², nub in the middle (diagonals are a slide, as written).
- **B** then **A** on the right (red / orange discs, `x` / `z`).
- **Esc** / **Run** in the gutter.

A finger can drive the machine without a keyboard. PICO-8's mobile player also has a pad; tic80.com in a phone tab does not give you this chrome. Ours wins that piece.

The 240×136 **picture** on a portrait phone is a postage stamp: a landscape strip in a 390×690 canvas, huge navy above and below. Fullscreen is declared ("hold your phone's picture sideways") and was not a first-run orientation. Until landscape is the default, phone play is a tiny TV on a table.

## Piece judgements

### Icon — OURS

12 frames (12 GCEs in the packed GIF). The little computer walks on a cart sticker; the label is the 240×136 screen. At Home Screen size it still reads "tiny computer," not a decoration. tic80.com is a website with a 64px PNG. PICO-8 is a paid app icon. This is the one piece that already wins.

### Cover — COMP

`cover.jpg` is a 1200×720 illustration, not a frame of the running cart. Dark bezel, white type, `HELLO` on the chrome. First boot is light `cls(13)`. Listing hero (`/store.html#app=tic80`) requested `/apps/tic80/cover.jpg` (cover rule held — the GIF was not fetched) and in this capture the hero box painted empty. Grid-card size, the illustration would still be "a fantasy computer"; it would still not be the first minute.

### Listing — COMP (overclaim = failed round)

Rendered listing matches `listing.json`. Tagline is a good card line. Description leads with the platform reason, then the engine, then "nothing from PICO-8's store," then phone and Invite. Credits are honest (unofficial, Vadim Grigoruk, bugs to GifOS, MIT inside the GIF, signed). The `pico-8` tag is SEO; the body is explicit that those carts are not here.

Every lead claim is false of this build:

| claim | running build |
| --- | --- |
| "Close it, the game is still in there" | `disk` is `[]`; `load hello` is `cart loading error` |
| "hand the file to someone, and the same tiny computer is still in there" | the engine default is in RAM, not the GIF's carts on a disk |
| "Whoever opens the link sees the carts on your desk" | desk is empty; Carts sheet says None yet |
| "Two MIT carts ride along" as playable from Carts | overlay lists them; tapping them does not `load` / `run` |
| "On a phone a pad sits under your thumbs" | **true** |

Store search for `tic80` is **"Nothing matches that."** `site/apps/index.json` has 156 apps, including `bitsy`, not `tic80`. `#app=tic80` and `/?run=tic80` resolve through `app.json` / `site/apps/tic80/tic80.gif` directly. A stranger browsing the grid cannot find it.

`app.json` / source `manifest.json` say `minBuild` 1178. The packed GIF's manifest — and the listing's "Requires" line — say **1314**. The file and the catalog record are not the same computer.

### Engine / 240×136 — tie on the picture, COMP on the product

Official 1.1.2837 HTML wasm + glue, hash-pinned, `wasmBinary` from `gifos.assets('tic80.wasm')`. Console, surf menu, editors, Lua: the machine is theirs. Canvas CSS is `width:100%; height:100%` — the engine letterboxes 240×136 inside whatever the iframe is, not a locked integer window. Desktop looks like TIC-80. It is not better than TIC-80.

A relative `/api?fn=version` (string inside the wasm, desktop-export leftover) 404s on origin. Harmless. Not a CDN.

### Carts / no PICO-8 — OURS (wall held)

Packed files: `hello.tic` (1616 B) and `fire.tic` (1464 B), built from `vendor/carts/hello.lua` + `fire.lua`. Those are official `demos/luademo.lua` and `demos/fire.lua` from the v1.1.2837 tag, MIT. File picker accepts `.tic,.lua,.js,.gif,.png,…` — **not `.p8`**. No Celeste, no BBS dump, no Splore. `COPYING-tic80.txt` and `UPSTREAM.txt` ride in the GIF. This round is clean.

### Disk-in-GIF — COMP

Not implemented in the running GIF. Seed bytes sit in `carts.js`; live FS never mounts; `disk` is never written. tic80.com forgets the same way. The desktop export with `--fs` does not.

### Invite desk — COMP

Did not two-tab. Host path has nothing on `desk` to replicate. Pads published `{id, name, mask:0}`. Original has no multiplayer — that is the intended win, and it is not there.

### Phone — pad OURS, picture COMP

Pad as specified. Picture is a 240×136 stamp in portrait. PICO-8's square 128×128 is the better phone image. Ours should have been landscape-first; fullscreen is declared and unused on first run.

### Distinct from Bitsy — OURS

Bitsy is a story-world you walk: rooms, dialogue, 8×8 tiles, no Lua machine. This is a fantasy computer: 240×136, console, sprite/map/sfx/music, Lua/JS. They share a pixel look and a MIT port story. They are not the same app. Catalog already has `bitsy`. This slot is the computer, if it ever keeps a cart.

### No CDN — OURS (wall held)

App-frame requests stayed on the origin that served the unpacked GIF: `index.html`, `style.css`, `tic80-start.js`, `carts.js`, `fs.js`, `touch.js`, `net.js`, `boot.js`, `.assets/tic80.wasm`. tic80.com is a cart gallery that fetches covers and play URLs. PICO-8's BBS is a store. Ours did not phone home.

## Wall breaks

- **No remote load.** Held. Zero off-origin from the app frame. `/api?fn=version` is same-origin 404 from the wasm, not a fetch to tic80.com.
- **No commercial PICO-8 carts.** Held. Two MIT demos, named, hashed, noticed.
- **Saved data in gifos.db.** Broken as a promise: `disk` declared, never written, so there is no "cart you save still loads."
- **Listing truth.** Failed round. Overclaim, not a style note.
- **Catalog index.** `tic80` is absent from `site/apps/index.json`. Search cannot find it. `bitsy` can.
- **minBuild 1178 vs 1314.** Source and packed GIF disagree. Listing follows the GIF (1314).
- **MIT inside the GIF / unofficial / blessed:false / Invite is OS chrome.** Honest on paper.
- **Cover rule.** Held on the network: listing did not fetch `tic80.gif`.

## Bar check

Bar ONE (TIC-80 1.1.2837 / PICO-8) is not mediocre. The 240×136 picture, the console, the editors, Lua carts: that is the floor. "As good as" would already lose on a port that forgets the disk; this is the official engine with its `--fs` left off, so `load hello` errors and Fire is a button that does not play. PICO-8 remains the name people know, paid, and we correctly did not steal its carts — which also means a PICO-8 owner is not the customer until this computer keeps one.

Bar TWO is why this should have won: carts in the GIF, Invite the same desk, not Bitsy. The pad is real. The disk is not. It does not win, yet.
