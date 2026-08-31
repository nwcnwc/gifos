# Breakout — fresh-eyes critic

Played blind against the named comps: Jake Gordon’s live demo at jakesgordon.com/games/breakout/ (the port source), and Atari Breakout as the feel floor (arcade flyer + 2600 still). Ours was the shipped GIF in the GifOS sandbox — desktop, a 390×844 phone, and a two-browser invite over the local relay.

## Winner: OURS

Solo, this is the original court: pastel five-row wall, orange paddle, black ball, ready/set/go, three lives, same brick values, same speed curve. After a 7-second rally the wall was missing four bricks at 305 points, the same way the demo lost a brick at 75. The vendor files are unmodified; the physics are not a remix.

The demo is a 2011 tutorial on a paving.jpg page with localStorage and one paddle. Beating it by a hair would still be shipping something weak. The version here is the one that has a reason to exist.

## Stranger-reason

You send Invite in the bar. A cyan paddle appears on the same brick wall. You both keep the same ball up and you both score on the same bricks. Close the file; the high score is still in it — 2785 survived a close-and-reopen in `gifos.db` (`prefs.high`), on the canvas as `HIGH SCORE: 0002785`, and as `BEST 2785` in the letterbox. No account, no install, no server. The original cannot do any of that.

Said back: *I send a link and we share one wall, and the high score lives in the GIF I can hand someone.*

## Single biggest remaining gap

**The extra paddle — the whole reason to use this version — spawns on top of the first.**

Alice hosted, Bob joined: names, colours, hints, and a shared world all worked (score 150 / 2 bricks on both sides, ball within a pixel). Then at the moment the second paddle appeared they were 18px apart (`p1=527`, `p2=509`) on a ~126px-wide bat: the screenshot is one orange/cyan sandwich with the labels reading `BobAlice`. The listing cover shows two neatly spaced paddles. The running app does not. They can be dragged apart; a friend who just opened the link sees a mess.

(Host-authoritative 20 Hz is the known physics tax. In this session Bob’s move to the right wall landed on Alice at the same `x=540`. A delayed miss was not the thing that showed up first.)

## By piece

**Icon.** OURS. At 64px on the Home Screen next to Camera / Welcome it is a brick wall, an orange paddle, a ball. The 16-frame loop flies the ball up and pops a brick — it earns the loop, it does not wiggle. One paddle only; two would mud at this size.

**Cover.** Comp’s catalog, not the demo (the demo has no store art). The hero is 678×407 of the generated 1200×720: two paddles, a missing brick, a spark. It sells the invite. It also spends most of the frame on empty grey, and the spark is drawn on — the running game never paints a star. A real rally (missing bricks, ball in the air, named paddles) is more alive than the listing picture. No `coverCrop`; the dark letterbox is the cabinet.

**Listing.** OURS on copy. Tagline on the rendered page: *High score lives in the file. Invite a friend: two paddles, one wall.* The description leads with the invite, then solo, then phone, then the port credit. Claims that were true in this run: Invite in the OS bar, second paddle, shared bricks/score/lives, high score in the file, drag and arrows, Space, ↑↓ level, finger-follow on phone, no account. Soft: *still on the same run of luck* is the high score, not the rally — an in-progress wall is discarded on close (hits 1 → 0, state back to menu). A third watcher is in the seating code; this run did not land a third client on screen.

**Bricks / paddle / physics.** Tie with the demo, which is the floor. Same wall, same paddle gradient, same intercept physics. Lost versus the demo: the paving.jpg showing through a translucent court, the MP3s (hits are square-wave beeps), the PNG level arrows. Lost versus Atari: this is five pastel rows on grey, not eight bright rows on black. Gained: a dark letterboxed cabinet that is an app, not a blog post.

**Touch.** Drag writes the same paddle the keys move (172 → 666). Original used `touchmove` + `pageX`; this uses pointer events on the court. It works.

**Phone.** Playable, not polished. Portrait 390-wide: 4:3 court, `tap here to start / drag paddle to move`, ◀ ▶ pads in the letterbox (`padsH≈86`, overflow none). Landscape hides the pads and leaves a 383×287 court in a black sea. The vendored scoreboard was built for 640px: on the phone `HIGH SCORE` sits on the life pips.

**High score in the file.** True. `gifos.db` `prefs` `{high:2785, sound, level}`. Reopen keeps it. Original keeps a number in the origin’s localStorage; it does not travel with the game.

**Two-paddle invite.** True, and it is why OURS wins. OS Invite (the app never draws that button). Alice orange, Bob cyan, names on the bats and in the chrome, shared world, guest writes only `x`. After a move they match. They just spawn stacked.

## Walls

None broken in this run.

- No CDN, no web font, no remote at load (`connect-src` can be none; `vendor.mjs` is the pin, not the GIF).
- Saved data is `gifos.db` only; the high score written by this build loaded after close.
- Manifest: `db` + `multiplayer`, no `network`. `minBuild` 947.
- MIT notice packed inside the GIF as `COPYING-javascript-breakout.txt`.
- Catalog listing is signed as gifos.app; cover is JPEG, not the GIF.
