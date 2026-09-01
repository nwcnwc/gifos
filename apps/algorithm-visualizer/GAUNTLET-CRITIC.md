# Gauntlet critic — Algorithm Visualizer

Bar ONE: **algorithm-visualizer.org** (Jinseo Jason Park). Driven 2026-08-31: `ERR_CONNECTION_REFUSED`. Wayback capture of the live IDE also failed. The floor is the product as it was: dark IDE, code on the left, Chart/Array/Graph/Log on the right, GitHub login, a compile server, JS/C++/Java, a catalog of hundreds. That site is not a thing you can open today.

Bar TWO: the platform — offline, last algorithm in the GIF, one Invite is follow-along.

Judged on the packed GIF in the real GifOS sandbox (desktop 1280×800 and phone 390×844), the rendered `/store.html#app=algorithm-visualizer` listing, icon frames at 48/64/128, cover at card (240) and hero (680), and a second browser context joined through one invite link. One Chromium.

## Winner

**OURS**

The original is a dead compile-server website. This copy is a working player: Bubble Sort / Quicksort / Binary Search / Dijkstra / N-Queens all ran, Play/Pause/Prev/Next/seek/speed all moved the cursor, close-and-reopen restored Dijkstra, a guest followed Quicksort then Dijkstra and could not steal the clicker, and after `setOffline(true)` the phone still stepped. A stranger who knows the original has a reason (below). "As good as the original IDE" is not the win — the original needed a server that is gone.

## Single biggest remaining gap

**There is no algorithm on screen — no source, no highlighted line.**

The original's identity was "visualize algorithms from code." Ours is a reel of 19 canned traces. Chart + array + log are faithful (blue select, magenta patch, the same tracer names), but a teacher cannot point at the line that just swapped. That is what a stranger who used algorithm-visualizer.org notices before they notice the plane. Adding a read-only, step-synced source pane (no compile server) is the gap. Not more algorithms, not a prettier icon.

## Stranger-reason

"The website is down. This one runs on the device, still on Dijkstra when I open the file tomorrow, and I can send a student a link so they watch the same walk-through — they cannot grab the clicker."

Said back without prompting. Verified: restored title after reopen was `Dijkstra's Shortest Path`; guest body was `guest`, pill `Following · 2`, same graph and cursor (host 7/25 vs guest 8/25, one frame of lag); guest click on Bubble Sort left them on Dijkstra with blurb "Following the host — they pick the algorithm."

## Wall breaks

- **No CDN / no remote load:** pass. After mount, app requests were `127.0.0.1:8099` only. CSS is system-ui, not a web font. Manifest has no `network`.
- **Save in gifos.db:** pass. `save` row `last` survived a full close and `run.html#id=` reopen.
- **minBuild 947:** listed as such; honest.
- **Assets inside the GIF:** packed by `build.mjs` (html/css/js + COPYING).
- **Catalog index:** **fail to ship.** `site/apps/algorithm-visualizer/` has gif + cover + app.json, but `site/apps/index.json` does not name the slug. Store search for `algorithm` rendered "Nothing matches that." Direct `#app=algorithm-visualizer` still paints the listing. A stranger browsing the grid cannot find it until the catalog is regenerated.
- **Overclaim (soft):** listing says "the tracers are the original ones." They are an API-compatible reimplementation, not vendored `tracers.js`. The types (chart, array, graph, log) are the original's. Not a sandbox wall.

## Pieces (evidence, not the winner)

**Icon.** 12 frames, 120 ms, six bars, the pair at i=2/3 highlights blue then swaps magenta. At 64px on the Home Screen (next to Welcome.gif / Camera.gif) it reads as a *chart*, not "algorithms." The swap earns the loop if you watch; at a glance it is generic. Not a wiggle. Not a wow.

**Cover.** Procedural pixel-font drawing (`icon.mjs` `screenshotPng`), not a frame of the running app. The real UI is system-ui and cleaner than the art. At hero (680) the bars still sell Quicksort mid-pivot. At card (240) the sidebar and log are mush — Carbon and SQL Playground still look like software at that size. Sidebar in the drawing is also a lie: it omits half the catalog. Retake from the live player (toolbar cropped).

**Listing.** Tagline leads with the platform reason; every claim that was testable was true (19 algorithms, invite lock, save in the file, no compile server). "Invite in the bar above" is true *in the app*, not on the listing page. Copy is in the same league as sql-playground / learn-git-branching. Grid card could not be judged: the slug is missing from `index.json`.

**Tracers — sort.** Bubble Sort and Quicksort: ChartTracer + Array1DTracer + LogTracer, 12 bars, swaps in the log, blue/magenta. This is the original's visual language and it works.

**Tracers — search.** Binary Search: sorted bars, Find box, probe in the log ("probing index 6 = 10"). Range-select paints the whole remaining window blue, so the probe is the one magenta cell in a wall of blue. Readable, washed out.

**Tracers — graph.** Dijkstra: 6-node circle, weighted edges, visit blue / left green, distance row with `∞`. Restored mid-walk matched the host. Best tracer of the three. BFS in the catalog is **not BFS** — it relaxes weighted edges through a queue (the blurb admits "shortest by edge weight via relaxation"). A learning app that misnames BFS is a trust nick, not the biggest gap.

**Playback.** Play ↔ Pause, Prev/Next, seek, 0.5×–8×, Space/arrows. Auto-plays on load (you land mid-trace). Seeking backwards rebuilds; it did not glitch on 12-element sorts.

**Last-algorithm-in-GIF.** Pass, as above.

**Invite follow-along.** Pass, as above. Host pill `2 watching`. Guest controls dimmed.

**Phone (390×844).** Hamburger opens the full 19; Quicksort and Dijkstra both ran; airplane-mode still stepped. Player row overflows: Shuffle and speed fall off the right edge; last array cells clip; the 4-Queens grid is a postage stamp in an empty pane (same on desktop). Dijkstra on a phone is the one layout that fills the stage.

**N-Queens / grid tracers.** 4×4 in the top-left, rest of `#stage` empty. The flex pane does not scale the grid.

**Start = 0.** Dijkstra's Start field rendered empty (End showed `5`). A number input whose value is `0` is indistinguishable from "unset."
