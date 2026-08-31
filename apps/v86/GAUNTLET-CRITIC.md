# Gauntlet critic — `apps/v86` vs https://copy.sh/v86/

Inspected the running GIF (desktop 1280×800 and phone 390×844), the Home Screen icon at 64px, `cover.jpg` at card and hero size, the store listing at `/store.html#app=v86`, and copy.sh/v86 `?profile=freedos` (same FreeDOS floppy). One Chromium.

## Winner: OURS

## Stranger-reason

copy.sh has to fetch `v86.wasm` and the disk from the network (`copy.sh` + `i.copy.sh`) before FreeDOS will even start. This one is a 2.1 MB GIF: SeaBIOS, VGA BIOS and the 720K floppy are already inside it, it boots on a plane, and a file you write on A: is still there after close — the floppy is the save.

## Single biggest remaining gap

**The CRT clips the VGA framebuffer.** `#crt` is `overflow: hidden` with a 7px radius, and `screen_set_scale` makes the 80×25 text wider than the bezel (`pre` 706px vs container 690px on desktop; 374px vs 350px on a phone). Every line loses column 0: `A:\>` reads `:\>`, `COMMAND` reads `OMMAND`, `ZZZ.COM` reads `ZZ.COM`. On a phone the right edge goes too. copy.sh’s plain 80×25 is fully readable, including `A:\>`. Until the whole screen sits inside the glass, the nicer chrome loses the only thing that matters on a DOS box.

## Wall breaks

1. **Catalog index does not list the app.** `site/apps/v86/{v86.gif,app.json,cover.jpg}` exist and the deep link `#app=v86` renders. `site/apps/index.json` has no `v86` entry. Store search for `v86` is “Nothing matches that.” `build.mjs` refuses to run `build-app-catalog.mjs`. A stranger browsing the store never sees it.
2. **GPL corresponding source is not in the GIF.** The packed floppy’s own `README` says a source archive “should be available with the disk/disk image.” The GIF ships `COPYING-freedos.txt` (GPL-2 text) and the `.img`, not that archive, and no written offer. `vendor/PIN.txt` (the only SeaBIOS source pointer) is also not packed — LGPL-3 notices are, the offer is not. Distribution unit is the GIF.
3. **No other platform-law breaks on the boot path.** No CDN/font/remote fetch at load (only `blob:` workers). No `network` capability. Saves go through `gifos.db('disk'|'snap'|'prefs')`. `minBuild` 1314 matches `capabilities.fullscreen`. No Windows or macOS ROMs in the tree — only `seabios.bin`, `vgabios.bin`, `freedos722.img`.

---

### Icon — OURS

12 frames, 120 cs delay. Dark CRT, red power LED, then `V86` → `A:\>` with a blinking block → `DIR`. Reads as a PC at 64px; the loop demonstrates a boot, it does not wiggle. Crunchy at Home Screen size, and the LED is red while the running app’s LED is green, but it says what the app is.

### Cover / listing art — OURS at hero, weak at honesty

Hero (680×409 on the listing) is a phosphor CRT that sells “DOS PC in a GIF.” Card-size (~240px) is still a CRT, still readable enough. It is a **drawing**, not a capture: extra columns (`INVADERS SNAKE TETRIS ROGUE`) that `DIR` does not print, and a perfect `A:\>` the real app currently clips. Mid-use would be invaders in play, not a staged prompt. No shell toolbar, so no `coverCrop` needed.

### Listing copy — OURS

Tagline is the reason in one line. Description leads with copy.sh’s network fetch vs this file, then DIR / games / nasm / vim / floppy-as-save / Sleep-when-it-fits. Every claim I could press was true (DIR, `copy hello.com zzz.com` survived reload, Sleep wrote an 806 KB snapshot, no remote BIOS). “Unofficial port” pill is present. License fact is a copyright mash that leads with the FSF’s license-document copyright and names BSD-2-Clause only — the floppy is GPL, SeaBIOS is LGPL; those are in the GIF, not in the fact.

### FreeDOS boot — same disk, COMP wins the picture

Both boot SeaBIOS → FreeDOS kernel 2040 → FreeCom → `A:\>` in a couple of seconds. AUTOEXEC still prints **`Running on copy.sh/v86/`** on ours. Status can say “Running · offline” as soon as the kernel banner matches `/FreeDOS/`, before the prompt. Ours is packed; copy.sh fetched wasm then the floppy. The usable screen is copy.sh’s.

### Floppy-as-save — OURS

`copy hello.com zzz.com`, Pause (`floppy saved`), reload, `dir zzz.com` → `ZZZ.COM` 25 bytes. Sleep compressed RAM to 806 KB and a second page restored that snapshot (`waking…`). Factory’s `persistDisk()` is not awaited before `delete` — a race, not the headline. copy.sh can “Get floppy image” / Save State; it does not live inside a file you already hold.

### Fullscreen — COMP

`requestFullscreen` on `#bezel` is wired and `fullscreenEnabled` is true; the sandbox will grant it (`capabilities.fullscreen`, `minBuild` 1314). README claims orientation lock; `screen.orientation.lock` is never called. Fullscreen is the bezel only, so a phone that goes Full loses Pause / Keys / Type. copy.sh has Go fullscreen, theatre mode, and a scale control.

### Phone — chrome OURS, screen COMP

Extra-key row is real: Esc, F1–F10, Ctrl/Alt/Shift, arrows, Type… (27 buttons, 203px). Toolbar wraps to two rows. No horizontal page scroll. The 80-column screen does not fit a 350px CRT, so lines die on both edges and `A:\>` is `:\>`. copy.sh on a phone is a stack of lab buttons, but the prompt is fully spelled.

### Licenses — notices packed, source offer thin, no Win/Mac ROMs

| work | license | in the GIF |
| --- | --- | --- |
| v86 | BSD-2-Clause | `COPYING-v86.txt` |
| QEMU floppy bits | MIT | `COPYING-v86-qemu-floppy.txt` |
| SeaBIOS / VGA BIOS | LGPL-3 | `COPYING-seabios.txt` + `COPYING-gpl-3.0.txt`; source URL not packed |
| FreeDOS Ripcord floppy | GPL-2 | `COPYING-freedos.txt`; image packed; source archive not |

No Windows, no macOS, no commercial ROM. copy.sh’s front door is an OS zoo that includes those. The listing’s “No Windows, no macOS” line is true of this build.
