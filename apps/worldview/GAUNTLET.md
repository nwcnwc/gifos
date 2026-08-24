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
- **The multiplayer leg has not been driven through a live Invite in two
  browsers** in this run. The shared collections are declared and wired
  (`session` read-write with a `lead` entry, `cursors` per person); the e2e
  suite does not yet open a second browser against a room.
- **The App GIF is unsigned.** `node scripts/sign-apps.mjs` needs the private
  key, which is not on this machine — `--require-signed` will fail until the
  owner signs it.
