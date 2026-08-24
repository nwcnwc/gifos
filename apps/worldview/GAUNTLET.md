# Worldview gauntlet

Comp (bar ONE): **NASA Worldview** itself — worldview.earthdata.nasa.gov. This
is a port, so "as good as" is losing: we took their work into a new home, and
the version here has to be the best version of it that has existed.

Bar TWO (the platform): offline, the file is the save, one Invite is a shared
map, no account, no install, a GIF that makes the animation.

**The sentence a stranger has to be able to say back:** *"It is Worldview, but
the Earth is still there when the connection isn't, the file remembers where I
was, and one link puts someone else on the same map."*

The comp was inspected as a real screenshot of the running product (NASA's own
`Worldview-snapshot.png`, shipped in nasa-gibs/gibs-api-docs), and the app was
inspected as screenshots of the REAL packed GIF running in the real GifOS
runtime at four viewports — phone 390, tablet 834, desktop 1440, wide 1920 —
with GIBS routed to local fixture tiles cut from a Blue Marble texture (this
box cannot reach NASA; see "What is still missing").

## Round 0 — first playable (2026-08-24)

Plate-carrée tile engine on GIBS EPSG:4326, 74 layers, layer stack, timeline,
A/B compare, animation with a local GIF encoder, offline base, place search,
co-view. 33 e2e checks green.

## Round 1 — three blind critics (2026-08-24)

Three fresh-context critics, none of which saw the code: one given the two
desktop screenshots BLIND as A and B, one given the phone leg, one given the
1920 leg.

**The blind A/B picked ours** on craft (8 vs 3) and "would you show this to
someone" (8 vs 3) — and marked ours BELOW theirs on information clarity (5 vs
6), which was the useful half. All three critics landed on the same finding
from three directions:

> The date is the product, and the date control was a decoration. A five-year
> ruler makes one day a fifth of a pixel. The playhead and the date readout sat
> 1,200 px apart. On a phone, four objects floated at four heights over the
> imagery and the ruler ran off the bottom of the screen into the home
> indicator.

Fixed this round:

- **One bottom bar, one baseline.** Date at 21px (the biggest thing on it),
  stepper, Today, Days/Months/Years, Play, Animate. It opens on DAYS.
- **The playhead is a handle with the day written on it.**
- **A calendar that greys out days the visible layer does not publish** — the
  question is not "what day is it", it is "which days have imagery".
- **The phone gets two labelled buttons** (Explore, Tools) instead of six
  unlabelled glyphs glued to the screen edge; sheets went opaque over the
  imagery; the map's furniture hides while a sheet is up.
- **Wide screens get an inspector**: where you are, the top layer's resolution,
  cadence, record, GIBS id, whether it has anything for this day, its legend
  and NASA's own description. 1920px used to buy nothing but more ocean.
- Undo on layer delete. Compare closes the panel and stops drawing its divider
  through the header. Destructive buttons look destructive. Layer titles wrap
  instead of truncating the only word that distinguishes them.

### The icon

The critic could not find a changed pixel between two moments and called it
"a JPEG wearing a .gif extension". It was half right: the first cut swept a
band across a STILL globe and then held it for the back half of the loop.
(Screenshots also freeze GIFs, so the loop is judged from the extracted frames
now, not from a screenshot.) It is a rotating Earth under a fixed imaging swath
now — land rises at the left limb unimaged, crosses the scan line, comes out
the other side in colour, which is what a polar orbiter actually does.

Also fixed: the palette had 35 entries in a 32-colour table, so every pixel
past the end came out as whatever the decoder had there — a white Sahara. A
palette that overflows does not warn, it hallucinates. 64 entries now, checked.

### Store art

`screenshot.png` is the app over the Sahara and the Mediterranean at 1440×864:
place labels, coastlines, borders, the layer stack, the inspector describing
what is on screen, the timeline with day ticks and the playhead on today.

**It is the packed Blue Marble, not live imagery, and that is deliberate on
this box:** the cover may only show pixels the app really draws, and this
machine cannot reach `gibs.earthdata.nasa.gov`. The state on the cover is real
and permanent (it is what the app shows with no connection, and what fills the
gaps between satellite passes) — but a live cover would be better, and
`WV_LIVE=1 node apps/worldview/tools/shoot.js` takes it in one command from a
machine that can reach NASA.

### Listing copy

Leads with the reason to use this version instead of the original — works with
the connection off, the file is the save, one Invite is a shared map, no
account, no install — then what it is, then the honest credit and the "not
endorsed by NASA" line. Every claim in it is true of the build it ships beside;
the unit test checks the layer count in the copy against the catalogue and
refuses any "syncs across your devices" language, because there is no cloud.

## Round 2 — the invite, driven for real (2026-08-24)

`test/browser/e2e-worldview-mp.js` opens two browsers on one invite link
through a real relay. It found the room silent, and two reasons for it:

- **Nobody spoke first.** The host only pushed its view once it knew someone
  was there, and it learns that from the guest's presence record — while the
  guest waited to be told where to look. Two people in a room, two different
  Earths. A guest now announces itself on arrival (and again while the room
  settles, because a join is a race and a record written into a lane that is
  not listening yet is simply lost); the host answers with its view
  immediately and three more times over the next twelve seconds.
- **Layer changes were not part of the shared view.** Panning synced; switching
  a layer on did not. Every layer mutation pushes now.

Ten checks green: the room link, the guest mounting the app with no install,
converging on the host's place and day, following the host's move, the guest's
cursor on the host's map, a layer arriving in the guest's stack, and "on your
own" really detaching.

## Round 3 — one fresh-eyes user, eight scenarios, no source (2026-08-24)

A critic with no access to the code drove the REAL packed GIF in the real GifOS
runtime through ~25 scripted sessions on desktop, phone and offline, as an
earth scientist who uses NASA Worldview. It was asked the only question the
method says matters.

### "You know the original — why would you use this one?"

It answered without prompting:

> Because it is the only version of Worldview that is still there when the
> network isn't, and because it answers the question I actually ask ten times
> an hour — *does this layer have data on this day?* — before I waste a scroll
> on it.

Then it scored the app twice: **8/10 would keep on my phone** ("a better phone
Worldview than Worldview"), **4/10 would use for work** — "not for anything I'd
put my name on", because of three things it could not do. That gap is the
useful half, and all three were real.

### The three it could not do — all fixed this round

**A legend that fails is invisible.** It expanded one layer from each of the 24
families, measured the legend element, got height 0 and empty innerHTML every
time, and concluded the app has no legends at all — in the same breath as the
listing claiming it does. The fetch and the parser were fine; the FAILURE was
silent, and an empty box does not read as an answer, it reads as a broken
panel. There are three reasons a colour bar is not there and they are different
facts: NASA publishes none for this layer (its own 404 — remembered, so the app
never asks twice), we could not reach NASA (NOT remembered, or one dead minute
becomes a permanent "this layer has no legend"), and a colour map arrived that
would not parse (our bug, and it must not be dressed up as a gap in the data).

**Offline, the honest warnings went quiet.** Online, a layer with nothing over
the view says so in amber. Offline — where the app has nothing at all — both
warnings vanished and the inspector read "this day: from this file" while the
storage sheet reported 0 tiles kept. One branch: a tile GIBS answers 404 to is
MISSING, a tile that never arrived is FAILED, and only the first was counted,
so every tile fell into "still loading" for ever. "From this file" now requires
that something actually came from the file, and known-offline plus nothing
drawn says so at once instead of after an RPC timeout.

**The day on screen was not always the day in the box.** An 8-day or 16-day
composite publishes on its start day and the map draws it all week. That is
what NASA serves and it is correct — the app just never said which day you
were looking at. The row and the inspector name it now.

### And four things it could not reach at all

- **The Download button had an invisible label.** `.sheet-body a` is
  specificity (0,1,1) and beats `.primary` at (0,1,0), so the primary call to
  action at the end of a ten-second render was accent text on an accent
  background — measured 1:1. It is 9.4:1 now, and the suite computes the ratio
  rather than trusting the rule.
- **There was no way to reach Animate on a phone.** It lives in the bottom bar,
  and the bottom bar collapses on a phone — so the feature that makes the GIF a
  GIF had no entry point on the device the app is best on.
- **Every tour threw away the offline basemap.** All fourteen used
  `Coastlines_15m` and six used `Reference_Labels_15m` — GIBS NETWORK rasters —
  and a tour replaces the whole stack. Take a tour, get on a plane, and the
  coastlines you had are gone, which is the one thing this port is for. The
  build now refuses a tour that reaches for network furniture.
- **"Borders" was shipped, drawn, offline-capable and invisible** — in the
  catalogue but not the default stack, so counting the offline layers in the
  panel gave four where the help promises five.

### What it found that was the harness, not the app

Worth writing down, because a critic's report is evidence and not a verdict.
"Zero network requests when adding a layer" was true of `window.fetch` — the
sandbox has `connect-src 'none'` and every request goes through the platform's
`gifos.fetch` RPC, which a fetch patch cannot see. And the drive harness 404s
every non-tile path, so no colour map could ever have loaded under it. The
legends work (`e2e-worldview` fetches and parses one against a fixture); what
was broken was what the app said when they did not.

### Three findings taken as true and NOT fixed

Named here rather than quietly dropped — see "What is still missing":
permalinks, the handoff to Earthdata Search, and 74 layers against Worldview's
thousand. All three are real, none is a bug, and each is a deliberate cost of
being an app inside a GIF.

### Fixed the same round, before the report landed

Found by reading the critic's own screenshots while it worked: the tablet
bottom bar was pushing its controls off the screen (an invisible 350px readout
at 834px), the expanded layer row printed NASA's paragraph a second time beside
the inspector, compare put two days on the map and one on the ruler, the phone
layer sheet hid the day it was about, the offline layer browser offered 74
equally-unavailable layers, and nothing anywhere had a keyboard focus ring.

## What is still missing

- **A live-imagery cover and a live catalogue verification.** Every layer id is
  checked against NASA's own configuration, but the matrix set / format /
  cadence for a few newer layers (the geostationary feeds especially) are
  inferred from NASA's descriptions rather than a live GetCapabilities.
  `node apps/worldview/tools/verify-catalog.mjs` asks GIBS for one tile per
  layer and prints what does not answer. **Run it before the next release cut.**
- **Polar projections.** Worldview has EPSG:3413 and EPSG:3031, which is how
  sea ice is actually looked at. Plate carrée mangles both poles.
- **Events (EONET).** Worldview lists live natural events and flies you to
  them. Explore is baked and offline, which is the trade this port makes, but
  "what is happening today" is a real gap.
- **The App GIF is unsigned.** `node scripts/sign-apps.mjs` needs the private
  key, which is not on this machine — `--require-signed` will fail until the
  owner signs it.
- **No permalink, and that is the one the reviewer minded most.** Worldview's
  URL *is* the citation: it is how a view gets into a paper, an email or a
  ticket. An app inside a sandboxed frame cannot write the address bar, so
  there is nothing to copy. Saved views live in the file and the file travels —
  a real answer for a colleague, and no answer at all for a footnote. If
  anything here earns platform work, it is a way for an app to mint a link back
  into itself; the launch keys (`at`, `date`, `layers`, `tour`) are already
  there waiting for one.
- **No handoff to the data.** Worldview's "Download data" hands a view to
  Earthdata Search and turns a picture into granules. An app frame has nowhere
  to navigate to, so the About sheet prints the addresses as text. That is the
  honest workaround, not a solution.
- **74 layers against Worldview's ~1,000.** No L2 swath products, and most of
  the atmospheric chemistry suite is absent. Enough to look, not always enough
  to find one specific product — and the catalogue is a hand-kept file
  (`tools/layers.curated.json`), so growing it is an edit, not a rewrite.
