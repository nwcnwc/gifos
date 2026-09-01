# Hanzi Writer — gauntlet critic

Blind A/B against **hanziwriter.org/demo.html** (the original widget) and **Skritter** (skritter.com — the paid stroke-order product). Ours was the unpacked tree with `gifos.db` mocked, then the packed GIF in `run.html` (OS Invite / Save / Help). One Chromium. Desktop 1280×800 and phone 390×844. Invite was not two-tabbed — Sam was injected on `players`. Not kana-quiz: zero multiple-choice buttons; the loop is a finger on 好 / 吗 / 睡 / 一.

**Winner: OURS**

**Single biggest remaining gap:** The writing surface is not a square. Help, the listing, and the cover all sell “a square, your finger.” `.stage { flex: 1; aspect-ratio: 1 }` lets the column flex win: Hanzi Writer is created at 418×418 (phone 364×364) and CSS stretches the canvas to 418×568 desktop / 364×612 phone (AR 0.74 / 0.59). The 米 grid is an SVG inset 8% of that tall card, so grid and glyph do not share a box. hanziwriter.org’s quiz is a 300×300 square. A stranger who knows the original notices the tall 好 before they notice the plane.

**Stranger-reason:** You know hanziwriter.org — why would you use this one? *The demo fetches `cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/好.json` for every glyph and forgets you. Skritter’s square is prettier, and it wants an account and $14.99/month before you draw. This GIF already has HSK 1–3 inside it. Close it on card 3 of 178; Continue is still there. Press Play a friend, then Invite in the bar: you both get 吗, and the pills read `You 0 0/6` / `Sam 4 3/6`.* That is a reason I can say back from using it. I would still open Skritter if I wanted spoken audio and twelve thousand textbook lists.

**HARD WALL:** catalog index. `site/apps/hanzi-writer/{hanzi-writer.gif,app.json,cover.jpg}` exist (GIF 991 KB, signed as gifos.app). `site/apps/index.json` has 156 apps and does **not** list `hanzi-writer` (kana-quiz is there). Store search for “hanzi” paints “Nothing matches that.” `#app=hanzi-writer` still loads `app.json` and the listing. The grid — the face — is missing.

Held: no CDN / webfont / remote at load (app requests were `index.html`, `style.css`, `vendor/hanzi-writer.min.js`, `vendor/chars.js`, `app.js`). Manifest has no `network`. `COPYING-hanzi-writer.txt` (MIT, David Chanin) and `ARPHICPL.TXT` ride in the tree and the GIF. `charDataLoader` never leaves the file. Saved rows are `gifos.db` (`prefs` private, `match` / `players` read-write). `minBuild` 947. Invite is OS chrome (`#invite` is not in the app; sandbox bar really says Invite). Jump to 龍 is an honest “No stroke data for 龍 in this file (HSK 1–3).” Listing claims that were checked are true of a run that actually starts, except “a square.”

## Face (always judged)

- **Icon (64px):** 永 written stroke by stroke, 16 frames, 110 ms. Frame 0 is the 米 grid; frame 7 is mid-glyph with a gold tip; frame 15 is the finished 永. It demonstrates, it does not wiggle. At Home Screen size it still reads as a Chinese character being written. Comp has no animated icon. This wins the slot.
- **Store art:** `screenshot.png` / `cover.jpg` is a painted 好 mid-trace, YOU 7 / SAM 4, STROKE 5/6, SAME CHARACTER. Mid-use, something happening, no shell toolbar. It is not a photograph of the running app: live UI is system-ui in a tall card, not 5×7 pixel type. At listing hero and at 390-wide card the 好 and the two scores still read. Beside kana-quiz’s four-button drill it is clearly a different product.
- **Listing copy (read on `/store.html#app=hanzi-writer`):** Tagline *Trace the stroke order. Close it — your progress is still in the file. One invite, the same character.* Description leads with the CDN, then the square, then Invite. Unofficial-port pill, David Chanin, 991 KB, HSK 1–3, first to ten clean. That is the right shape. “A character, a square, your finger” is the one line the live window does not keep.

## Pieces (evidence, not the winner)

**Stroke tracing — same engine, worse box.** Watch plays 好 with the 女 radical in coral and the live stroke in white, then returns you to the quiz. Three misses lights the correct stroke in yellow (`showHintAfterMisses: 3`). Misses increment in the HUD. Scripted mouse paths along the median and along the 米 midline both counted as misses on 一 and 好 — the stretch puts automation in the wrong Y, and I will not pretend I completed a clean trace. A finger following the ghost is what the library is for; the library is chanind/hanzi-writer 3.7.2, canvas renderer. hanziwriter.org’s demo is the same quiz in a square that does not lie.

**HSK set — OURS as a course, COMP as a dictionary.** 178 / 168 / 272 unique characters (HSK 2.0 levels 1–3) plus 永 = 619, all in `vendor/chars.js`. Jump to 好 starts a one-card drill, 6 strokes, HSK 1 in the meta. Jump to 龍 is refused. hanziwriter.org will fetch ~9000 glyphs from jsDelivr and has no levels. Skritter has textbooks, Japanese, audio, SRS — behind Sign Up and Stripe. This is not kana-quiz’s あ-row multiple choice.

**Progress in the GIF — OURS.** Skip twice in an HSK 1 deck (睡, 汉), Back, reload with the same `prefs` rows: **Continue 3 / 178** and **Review misses (2)**. Solo deck, index, missed list, outline, level survive in `prefs`. Clean count stays 0 until a clean finish (`stats` was empty after skips — Skip does not `bumpStat`). hanziwriter.org keeps nothing. Skritter keeps an account in the cloud.

**Invite, same character — OURS.** Lobby: “Press Invite in the bar above” + a faint 永. Injected Sam: both on deck[0] 吗, pills `You 0 0/6` / `Sam 4 3/6`, copy “Same character. First to 10 clean.” Skip is visible and disabled. Each side writes only its `players` row. Comp has no second person.

**Phone (390×844) — playable, still tall.** Versus 吗: Watch / Retry / Skip on screen (`watchBtn` 784–832 in 844), no document overflow, `touch-action: none` on the stage. Home actions sit at the bottom. The card is taller than it is wide (AR 0.59–0.68). Comp’s demo is a square that happens to fit; Skritter’s marketing is a native phone with a square 使.

**Sandbox GIF — runs.** `/?run=hanzi-writer` landed `run.html#id=file_…` with Invite / Save / Help in OS chrome and the real home (HSK 1, Outline, Start tracing, Play a friend). Srcdoc is `about:blank` (expected). Airplane-mode reload of an HTTP URL is not a product test; the GIF has no `network` path.

**MIT + Arphic — held.** Packed files include `COPYING-hanzi-writer.txt` and `ARPHICPL.TXT` unaltered. Listing license MIT, author David Chanin, porter GifOS, `basedOn.blessed` false. Stroke data is Make Me a Hanzi / Arphic; glosses are this port’s.

## Not the gap

No spoken audio (Skritter has it). HSK 1–3 only. Cover is procedural. Home is the same dark shell as kana-quiz — the drill is not: a square of ink, not four sound buttons. Those are real and smaller than the box you write in.

The run can leave on the stranger-reason (offline HSK, the file is the save, one invite is the same 吗). It should not leave until the stage is actually the square the listing already promised.
