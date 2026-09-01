# Parable of the Polygons — gauntlet critic

Blind A/B against https://ncase.me/polygons/ (Vi Hart & Nicky Case, CC0). Played the original in Chromium and this port from `apps/parable-of-polygons/` (local server, gifos.db mocked). One browser. Desktop 1280 and phone 390. Comp is the floor; for a port, “as good as” is losing.

**winner:** OURS

**single biggest remaining gap:** The automatic boards’ chrome is a sketch of the original. ncase.me paints a labeled SEGREGATION↑ / TIME→ graph (`stats.png`) and a dual slider whose bands are sad-face / happy-face / sad-face (`ds_sad.png`, `ds_happy.png`), plus START MOVIN’ / NEW BOARD sprite buttons. This copy is a blank dark rectangle with a red `1%` sitting on the origin, a faceless gray bar, and two generic CSS buttons. The mix slider is yellow/blue/black with no faces either. The town itself is the original sprites; the thing you *touch* for the second half of the essay is not. On a 390-wide phone that empty 230px stats well is most of the fold under the board.

**would a stranger who knows the original use this copy:** “Yes — I would keep this file. Close it and the sandbox sliders are where I left them (dragged 20% → 41%, reopened still 41%). Send the invite and a friend is in that town. It actually fits a phone (the original is `min-width: 1040px` and chops the title to PARABLE O). The words are still the words. I would still open ncase.me on a laptop the first time, because the graph and the face-slider are how that post *teaches* — but I would not leave a tab open on the original site after that.”

**HARD WALL:** none. Zero requests off the app origin at load (sprites are data URLs). No webfont. No `localStorage`. `COPYING.txt` (CC0 1.0 Universal) is packed in the GIF. `minBuild` 2154 matches `capabilities.links`. Listing claims that were checked are true: last sliders stay, one invite shares the sandbox town, unofficial, Vi Hart & Nicky Case, offline. English-only versus the original’s ~18 translations is a product gap, not a lie; the listing does not say otherwise. Invite was not two-tabbed here (one Chromium); `net.js` publishes `town` id `sandbox` (cells + sliders + running) and does not draw an Invite button.

## Face (always judged)

- **Icon (64px):** 12 frames, mixed triangles/squares shuffle into two camps. The loop is the lesson, not a wiggle. At Home Screen size the cute faces collapse to yellow/blue dots; it still reads “shapes splitting.” Original has no animated icon (static favicon). Small structural win.
- **Store art:** `screenshot.png` / `cover.jpg` is a drawn mid-use frame (segregated town, “SMALL INDIVIDUAL BIAS / LARGE COLLECTIVE BIAS”, 86%, 33% slider). No GifOS shell to crop. At listing hero it carries the moral. At a 300×180 card the two camps still read; at 240×144 the slider copy is dust. It is catalog-house pixel, not the original cute sprites. Beside ncase.me’s social thumbnail (hanging faces on black) a shopper who knows the post would not recognise the product. Beside 2048 / Flexbox Froggy / Evolution of Trust it is in family. The live app is prettier than its cover.
- **Listing copy (read on `/store.html#app=parable-of-polygons`, desktop and 390):** Tagline *Nicky Case’s Schelling explorable, offline — last sliders stay, one invite shares the town.* Description leads with file-is-the-save and Invite, then the essay, then unofficial. That is the right shape, and every claim is true of the build. Better store copy than the original’s one-liner. Tagline drops Vi Hart (the listing author line and the essay both have her). Unofficial badge is honest.

## Essay (the words were not flattened)

Opening, the 1/3 rule, Daaaaang, “Small individual bias can lead to large collective bias,” the segregated-world beat, the rainbow BOX OF FRIENDSHIP, WRAPPING UP 1–2–3, Schelling, Clark, Petrie, Donate to Diversity, beta-readers — present, in the original’s sentences. Mini unhappy / happy / meh use the original face PNGs and the captions are the original’s. Friendship box is there and labeled.

Cut from the original’s *after* “Thank you for playing”: Code 2040 on the donate list, Also Seen On, Translations, Things Based Off This Thing. Those are the press/remix appendix, not the argument. Splash has no language links (they live in the original’s intro iframe). Outro is one line of public domain; the classroom CC0 paragraph is in the refs, not on the hanging crowd.

## Sandbox sliders / save / invite / phone / CC0

- **Sliders:** Dual thumbs work; lock-right on the bias-only boards; mix slider is triangle:square + empty; desktop defaults match the original (20/80, 50:50, 20% empty). Drag updates the red numbers. Missing the face bands, as above.
- **Save-in-GIF:** `gifos.db('prefs')` private. Dragged sandbox bias 20% → 41%, new page with the same mem, still 41%. Town cells also land in `town` (323). The board layout is not restored on close — the listing does not claim it is.
- **Invite town:** OS chrome only. Host publishes the last town; guest applies cells/sliders/running; pill `N in this town` stays hidden when alone. Not two-tabbed in this run.
- **Phone:** 390×844, `overflowX` 390 (original 1040). Splash title sits on a dark lower band and is readable. Trio/duo stack. Manual board ~358px. Sandbox tiles ~17.9px — a finger cannot pick one; Start is the interaction there. Stats well is a tall empty box.
- **CC0:** Packed `COPYING.txt`; listing `CC0-1.0`; refs “Public domain (CC0)… classrooms… source… Vi Hart and Nicky Case”; outro “this playable post is public domain.” Original links that phrase to the CC0 deed and puts the classroom invitation on the hanging crowd. Credit is true; ceremony is thinner.

The run wins on bar two (the file keeps the sliders, one link is the town, a phone can read it). It is not yet the best *looking* version of this post that has existed — put `stats.png`’s axes and the face-banded slider back on the automatic wells, then retake the cover from the live sprites.
