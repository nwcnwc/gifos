# The Gauntlet Loop, reframed for improving GifOS apps

The **Gauntlet Loop** is Matt Shumer's method behind
[Claude of Duty](https://github.com/mshumer/Claude-of-Duty) (which this repo
ports as `apps/fps-simple/`) — the three-paragraph prompt that produced a
playable FPS and then [47+ community games](https://somethingbig.ai/games).
Method writeup: [somethingbig.ai/gauntlet-loop](https://somethingbig.ai/gauntlet-loop).
What makes it work, distilled:

- **A real bar, not an adjective.** The agent compares its output against a
  concrete thing it can inspect (real Call of Duty footage), never "make it
  great".
- **Smallest independently-judgeable pieces.** The lead agent decomposes; each
  piece can be improved and graded on its own.
- **The builder never grades itself.** Every piece gets a builder and a
  SEPARATE harsh critic with fresh context, who inspects the real output.
- **Blind A/B.** The critic puts the work beside the bar with labels stripped,
  says which wins, and names the single biggest remaining gap.
- **No fixed round count.** The loop exits when the work wins, or a human
  stops the run.

## The reframe

Improving an EXISTING app changes three things:

1. **It is an ascent, not a rewrite.** The app, its saved-data compatibility,
   and its listing already exist; the loop climbs from there.
2. **Two bars.** The best real product in the app's category sets the
   look/feel bar — and the PLATFORM sets the second: a great GifOS app
   exploits what GifOS hands out free (offline, state inside the icon,
   invite-link multiplayer with no server, brokered AI on the user's own
   keys, launch links, running inside a meeting). A missing platform power
   that would genuinely improve the app is a gap the critics must call.
3. **Hard walls.** The sandbox laws and the repo gate are not judgement
   calls: an "improvement" that violates one is a regression, whatever it
   looks like.

## The prompt

Fill in `<slug>` (the app at `apps/<slug>/`, i.e. gifos.app/store/`<slug>`)
and optionally name the comp; otherwise the agent picks one and says so.

```
I want you to take the existing GifOS app at apps/<slug>/ and improve it until
it is the best version of itself — an ascent, not a rewrite. Utterly polished:
every interaction, every visual, every empty state, every error message, the
icon animation, the store listing, at the quality of the best software in its
category.

First, set the bars. Play the app as it is: build it from apps/<slug>/, run it
in the real GifOS sandbox, desktop viewport and phone viewport. Bar ONE is the
strongest concrete comp you can actually inspect — the real, named product
this app competes with [name it, or: pick one and tell me]. Bar TWO is the
platform, and it is not optional: a great GifOS app makes someone want GifOS.
It works fully offline; its state lives inside the icon (gifos.db) so the file
IS the save and sharing the GIF shares the app with its data; one invite link
is multiplayer with no server; gifos.ai / gifos.api give it brains on the
user's own keys; a launch block lets a shared URL open it onto something; in a
GifOS meeting it gains shared voice and video around it. Any of those that
would genuinely make THIS app better and is missing or half-done is a gap.

Two pieces are ALWAYS in the gauntlet, because they are the app's face and get
judged before anyone plays: the ICON and the STORE ART. The icon is the App
GIF's visible animated frames (apps/<slug>/icon.mjs) — put it on a real Home
Screen at real icon size next to the seeded apps and judge it there: it must
read at a glance, say what the app is, and its ANIMATION must earn its loop
(an icon that merely wiggles loses to one that demonstrates). The store art is
apps/<slug>/screenshot.png, which becomes cover.jpg on the card and the
listing hero. It must catch the app at its best moment — mid-use, full of real
content, something happening — never an empty first boot or a wall of default
UI; crop the shell toolbar out (listing coverCrop); then its critic judges it
blind at BOTH sizes (grid card and listing hero) beside the comp's own store
or marketing art, and beside the best covers already in this catalog. If the
current screenshot is poor — many are — retaking it after the app improves is
part of the work, not an afterthought.

Split the work into the smallest pieces that can be improved and judged
independently, and fan out sub-agents: each piece gets a builder and a
SEPARATE harsh critic with fresh context. The critic never reads the builder's
reasoning — it opens the real running app (screenshots, real clicks and
touches, phone viewport, airplane mode, two browser contexts joined through
one invite link when multiplayer is in play), puts it beside the bar BLIND,
says which is better, and names the single biggest remaining gap. /loop each
piece until its critic is wowed or I stop the run.

The gauntlet includes the platform's laws, and they are walls, not judgement
calls: every asset vendored INSIDE the GIF — no CDN, no web font, no remote
anything at load; saved data only in gifos.db, and data saved by the CURRENT
version still loads after the update; network only through the manifest
allowlist; minBuild stays honest; the GIF rebuilds from apps/<slug>/ with its
own build script into site/apps/<slug>/, the catalog regenerates clean
(node scripts/build-app-catalog.mjs --check), and every test that was green
stays green. An improvement that breaks a wall is a regression.

When you believe it wins, prove it: a final blind A/B against the comp; a cold
run offline on a phone-sized screen; and a fresh-eyes sub-agent that has never
seen the code using it start to finish — including one who arrives through a
shared invite link knowing nothing. Update the listing (cover, tagline,
description) to sell only what is now true. Keep a simple live progress note
as you go. Fan out sub-agents and ultracode. /loop until it's utterly perfect.
```

## Picking bar ONE (examples)

The comp is the real product a stranger would otherwise use — named, current,
inspectable:

| app | comp |
| --- | --- |
| `2048` | play2048.co (the original) |
| `word-master` | NYT Wordle |
| `jspaint` | Paint on Windows 11 / Photopea |
| `squoosh` | squoosh.app |
| `vocal-remover` | the UVR desktop app |
| `chess-grandmaster` | chess.com's play-vs-computer surface |
| `anyroad` | Hop.Earth |

For a utility, "feel" includes first-run clarity and error honesty, not just
pixels. For a provider app, the bar is the paid cloud service it replaces
(quality per watt, first-token latency, honesty about limits).

## Running it

- Run from a development clone on `main` (never `~/release-process/gifos`),
  with the local servers from CLAUDE.md if the critic drives browser suites.
- Commit early and often on the way up — the step-by-step history is the
  point (CLAUDE.md).
- The critic's browser work has everything it needs in `test/lib/pw.js`
  (Playwright + Chromium resolution) and the recipes in `test/README.md`.
- A retaken `screenshot.png` becomes the published `cover.jpg` by running
  `node scripts/build-app-catalog.mjs` (it re-renders when the source is
  newer); `coverCrop` in `listing.json` cuts the shell toolbar out of the
  frame. The icon animation is rebuilt by the app's own `build.mjs` /
  `icon.mjs` into the GIF's visible frames.
- Stop the run when you love what you see; the loop has no natural end.

Credit: the loop, the harsh critic, the blind comparison and the refusal to
stop are all [Matt Shumer's](https://github.com/mshumer/Claude-of-Duty)
pattern; this file only points the gauntlet at the store.
