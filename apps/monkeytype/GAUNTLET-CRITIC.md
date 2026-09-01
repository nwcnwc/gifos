# Monkeytype — gauntlet critic

Blind A/B against https://monkeytype.com (Miodec, serika-dark, v26.32.0). Played this copy from the packed GIF (`site/apps/monkeytype/monkeytype.gif` decoded; `COPYING.txt` + `app.js` + 82 quotes ride inside). One Chromium. Desktop 1280×800 and phone 390 / 360. Store at `/store.html#app=monkeytype` and the grid search. Distinct from `apps/typing` (lessons + programmer passages, MIT, keyboard icon, ALL-CAPS pixel cover).

Bar ONE is the public test. Bar TWO is no account, the file is the save, one invite is a live race.

**winner:** OURS

**single biggest remaining gap:** The store grid does not contain this app. `site/apps/index.json` has 156 apps; `monkeytype` is not one of them. Search for "monkeytype" paints **Nothing matches that.** Search for "typing" returns Typing (and My Mind). Learning's aisle is bible / kana-quiz / **typing** / … — never this. The cover retake is a real mid-test serika-dark frame, and a shopper who never sees the card cannot install it. Deep-link `#app=monkeytype` and `/go/monkeytype/` still load `app.json`. Rebuild the catalog or the listing is a URL, not a product.

**would a stranger who knows the original use this copy:** "Yes — on a plane, and to race a friend from one link. The original is a merch banner, a cookie modal, ads (`doubleclick.net`, Amazon, Carbon), `api.monkeytype.com`, and an account if I want a record. This GIF is the same 3-line test, yellow caret after `on`, and the history lives in the file. I would install from that cover. I cannot find the cover by browsing or searching the store, so I stay on monkeytype.com until someone sends me the link."

**HARD WALL:** catalog (see gap). Not a network wall: packed-GIF origin requests were `index.html`, `style.css`, `vendor/data.js`, `engine.js`, `net.js`, `app.js`. No webfont, no CDN, no `localStorage`, no `fetch`. `COPYING.txt` is GNU GPL-3.0, 35149 bytes, inside the GIF. Listing `license` is `GPL-3.0`, author Miodec, `basedOn.blessed` false, donate is theirs. `prefs` private; `match` / `players` read-write; no `#invite`. `minBuild` 947. Signed by gifos.app. English 200 + 1k 1000 + 82 quotes is a product gap versus hundreds of languages and thousands of quotes, not a lie.

## Face (always judged)

- **Icon (64px):** 12 frames, 100 ms. Caret types `THE LAZY`, then `87 WPM` lands. The loop demonstrates the test; it does not wiggle. At Home Screen size the typing frames are cramped (`THE` is a stub) and the WPM frame still reads. Distinct from Typing's keyboard. Original has no animated icon. Small structural win.
- **Store art vs the live window:** The retake is the window. `screenshot.png` / `cover.jpg` is 1200×720 serika-dark, lowercase `like play some on|`, yellow caret after `on`, live `27 65 100%`. `Monkeytype.coverShot()` on the packed GIF paints the same words, same caret, live `27 66 100%` (one WPM of freeze-frame). Hero on `/store.html#app=monkeytype` is that JPEG at 680×409 — it is the test, including the empty lower half, because the running 1280×800 window is also empty under the hint. Card crop is 16:10 `object-position: top` (320×200 and 240×150): logo is tiny, the caret is still yellow, the three lines still read as common English, not a pangram. Phone listing (390) the same frame in a rounded rect; `on|` still reads. Crop is full-bleed (`coverCrop.top: 0`), no shell toolbar. **This is no longer the pixel-font `THE QUICK BROWN FOX` fake, and it is no longer Typing's ALL-CAPS lesson.** At card size it is honest and quiet — half the 16:10 is empty serika grey — but a shopper who knows monkeytype.com would now say "that's the test." Cover round is won. The grid never shows it (see gap).
- **Listing copy (read on `/store.html#app=monkeytype`, desktop and 390):** Tagline *The typing test, offline — personal bests live in the file, one invite is a live race.* Description leads with no account / plane / GIF-is-the-save / invite-is-a-race, then the test, then unofficial Miodec. Unofficial-port pill, License GPL-3.0, author Miodec, porter GifOS, donate Monkeytype, 233 KB, signed. Claims checked against the GIF are true. Better store copy than the original's one-liner. Useless on a grid that does not list the slug.

## The test (caret, WPM/acc, words/quotes)

The running test is the original's core. Serika-dark `rgb(50, 52, 55)`, `monkeytype` with yellow `type`, 3-line word flow, config pill (`@ #` / time words quote / 15 30 60 120 / english), Tab restart, Escape command line. Typed `seem nation hold` — letters go `--text`, caret is a 3 px yellow bar, config opacity 0, live `30` + WPM + `100%`. Words-10 wrote `NEW PB`, `52/0/0/0` chars, history row, `bests stay in this file`. `prefs` row in the mock store held `pbs` + history. Quote mode, punct+numbers, and `theme dracula` → `rgb(40, 42, 54)` were already the original's in the prior pass; the GIF still ships twelve palettes and 82 quotes (lengths 40–816).

It is still a sketch of the original, not a better one: `ui-monospace` instead of Roboto Mono, no zen / custom / funbox, **no result graph** (result is four numbers and a history list; original's post-test chart is what people screenshot), live WPM on the first burst is a fantasy (248–321 on four words; dumping ten words through `input` produced 7011 wpm in 0.1 s — a harness spike, not a product number, but the engine will print it), twelve themes not four hundred. Original mid-test (typed `wo` on `would`, red underline, timer 30, config gone) is the same picture with a merch bar on top. "As good as" is losing on the *payoff*. The test is why you open monkeytype.com; this copy has the test, not the graph.

## Bests in the GIF

`onFinish` writes `pbs` + last 40 results to `gifos.db('prefs')` (private) and paints `NEW PB` / history. Listing claim is true of the write path — this session's mock store held the row after the words-10. Reload of a fresh context is a new mock, so persistence across a real GIF reopen was not independently proven here.

## Live race invite

Lobby hide is done. `show('race')` sets `#testView.hidden`; measured `display:none`, 0×0. Screen is **Race a friend** / Invite copy / `Hana (you)` / Start race / ← practice instead. No practice words, no caret, no "click to focus" on top of the lobby. Countdown is a yellow `3` over the *race* words with the veil off (`veil.hidden === true`). GO focuses `#wordsInput`. Solo bars stay hidden (need ≥2). Prior pass already had two pages on one mocked room, same seed, live `Host (you) 36` / `Guest 0`. Original still has no live race (Tribe never shipped; this session's monkeytype.com is a merch store + cookie + ads). That is the platform win.

## Phone (390 and 360)

No horizontal overflow. Config wraps. Three lines of words. 16 px hidden input. At 360, `race a friend` wraps onto its own line under the hint — ugly, thumb-reachable. Veil copy is still "click to focus"; boot auto-focus hides it, so a real phone that refuses a keyboard without a gesture can sit on a blinking caret with no "tap to type." Original is a desktop site with a cookie modal; this is the more honest small screen.

## GPL notice

Packed: `COPYING.txt` inside the GIF (GPL-3 preamble). Store: License GPL-3.0, Unofficial port of Monkeytype, author Miodec, bugs to GifOS, donate theirs. `help.md` names the unofficial port. In-app chrome has no footer, no About, no GPL string in `document.body`. Original puts contact / github / terms in a footer and then covers it with ads. Distribution notice is satisfied; interactive notice is listing + help, not the test chrome. Not a wall.

## Distinct from `apps/typing`

Different job: this is monkeytype's word-flow test (time/words/quote, WPM/acc/raw/consistency, themes, command line, GPL). Typing is lessons and programmer passages (MIT). Icons differ (caret vs keyboard). Taglines differ. **Covers now differ** — serika-dark lowercase `on|` vs ALL-CAPS home-row lesson. The collision the last critic named is gone. The grid still only shows Typing.

The cover retake and the lobby hide landed. The stranger-reason is real. Until `monkeytype` is a card in Learning next to Typing, a stranger who knows the original never sees it.
